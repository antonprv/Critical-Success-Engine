#!/usr/bin/env python3
"""
quake_texturize.py

Converts any image into a Quake-1-style texture:
  - downscales to a target low resolution (that classic chunky look)
  - applies 8x8 Bayer ordered dithering
  - quantizes colors to the real, original 256-color Quake palette
    (host_quakepal, public domain per id Software)
  - preserves existing alpha transparency if present in the source image
    (or optionally chroma-keys near-black to transparent)

Usage:
    python3 quake_texturize.py <input_path> <resolution> [options]

Examples:
    python3 quake_texturize.py moon.png 128
    python3 quake_texturize.py noise.png 64 --strength 30
    python3 quake_texturize.py sprite.png 96 --chroma-black --out sprite_quake.png
    python3 quake_texturize.py texture.jpg 128 --upscale 256

    # Batch mode: process a whole folder recursively.
    # input_path must be a directory, and --batch is required to enable this.
    # Originals are never touched. Results go into a sibling "_edited" folder
    # (created next to input_path, i.e. NOT inside it), mirroring the same
    # internal subfolder structure.
    python3 quake_texturize.py textures/ 128 --batch
    python3 quake_texturize.py textures/ 128 --batch --chroma-black --upscale 256

Arguments:
    input_path        Path to a source image, or (with --batch) a directory
    resolution         Target working resolution in pixels (square, e.g. 128)

Options:
    --out PATH          Output file path for single-file mode
                         (default: <input>_quake_<res>.png next to input)
    --batch              Treat input_path as a directory and recursively process
                          every image file inside it. Originals are never modified.
                          Output goes to a sibling folder named "_edited"
                          (next to input_path, not inside it), preserving the
                          original folder structure. Override the folder name
                          with --out-dir.
    --out-dir PATH       (batch mode only) Custom path for the output root
                          folder, instead of the default sibling "_edited".
    --strength FLOAT     Bayer dither strength / spread, 0-255 (default: 40)
    --chroma-black       Treat near-black pixels as background and make them
                          transparent (useful for images on a black backdrop,
                          e.g. photos of the moon/planets against space).
                          Ignored if the source already has an alpha channel.
    --upscale N          After processing, upscale the result to NxN using
                          nearest-neighbor (keeps it pixelated, just bigger).
                          Default: no upscale, output stays at `resolution`.
    --matrix {4,8}       Bayer matrix size. 8 = finer/smoother, 4 = chunkier,
                          more visible grid pattern. Default: 8.
"""

import argparse
import os
import sys

import numpy as np
from PIL import Image

# ---------------------------------------------------------------------------
# The original 256-color Quake palette (host_quakepal), public domain.
# ---------------------------------------------------------------------------
QUAKE_PALETTE = [
    (0,0,0),(15,15,15),(31,31,31),(47,47,47),(63,63,63),(75,75,75),(91,91,91),(107,107,107),
    (123,123,123),(139,139,139),(155,155,155),(171,171,171),(187,187,187),(203,203,203),(219,219,219),(235,235,235),
    (15,11,7),(23,15,11),(31,23,11),(39,27,15),(47,35,19),(55,43,23),(63,47,23),(75,55,27),
    (83,59,27),(91,67,31),(99,75,31),(107,83,31),(115,87,31),(123,95,35),(131,103,35),(143,111,35),
    (11,11,15),(19,19,27),(27,27,39),(39,39,51),(47,47,63),(55,55,75),(63,63,87),(71,71,103),
    (79,79,115),(91,91,127),(99,99,139),(107,107,151),(115,115,163),(123,123,175),(131,131,187),(139,139,203),
    (0,0,0),(7,7,0),(11,11,0),(19,19,0),(27,27,0),(35,35,0),(43,43,7),(47,47,7),
    (55,55,7),(63,63,7),(71,71,7),(75,75,11),(83,83,11),(91,91,11),(99,99,11),(107,107,15),
    (7,0,0),(15,0,0),(23,0,0),(31,0,0),(39,0,0),(47,0,0),(55,0,0),(63,0,0),
    (71,0,0),(79,0,0),(87,0,0),(95,0,0),(103,0,0),(111,0,0),(119,0,0),(127,0,0),
    (19,19,0),(27,27,0),(35,35,0),(47,43,0),(55,47,0),(67,55,0),(75,59,7),(87,67,7),
    (95,71,7),(107,75,11),(119,83,15),(131,87,19),(139,91,19),(151,95,27),(163,99,31),(175,103,35),
    (35,19,7),(47,23,11),(59,31,15),(75,35,19),(87,43,23),(99,47,31),(115,55,35),(127,59,43),
    (143,67,51),(159,79,51),(175,99,47),(191,119,47),(207,143,43),(223,171,39),(239,203,31),(255,243,27),
    (11,7,0),(27,19,0),(43,35,15),(55,43,19),(71,51,27),(83,55,35),(99,63,43),(111,71,51),
    (127,83,63),(139,95,71),(155,107,83),(167,123,95),(183,135,107),(195,147,123),(211,163,139),(227,179,151),
    (171,139,163),(159,127,151),(147,115,135),(139,103,123),(127,91,111),(119,83,99),(107,75,87),(95,63,75),
    (87,55,67),(75,47,55),(67,39,47),(55,31,35),(43,23,27),(35,19,19),(23,11,11),(15,7,7),
    (187,115,159),(175,107,143),(163,95,131),(151,87,119),(139,79,107),(127,75,95),(115,67,83),(107,59,75),
    (95,51,63),(83,43,55),(71,35,43),(59,31,35),(47,23,27),(35,19,19),(23,11,11),(15,7,7),
    (219,195,187),(203,179,167),(191,163,155),(175,151,139),(163,135,123),(151,123,111),(135,111,95),(123,99,83),
    (107,87,71),(95,75,59),(83,63,51),(67,51,39),(55,43,31),(39,31,23),(27,19,15),(15,11,7),
    (111,131,123),(103,123,111),(95,115,103),(87,107,95),(79,99,87),(71,91,79),(63,83,71),(55,75,63),
    (47,67,55),(43,59,47),(35,51,39),(31,43,31),(23,35,23),(15,27,19),(11,19,11),(7,11,7),
    (255,243,27),(239,223,23),(219,203,19),(203,183,15),(187,167,15),(171,151,11),(155,131,7),(139,115,7),
    (123,99,7),(107,83,0),(91,71,0),(75,55,0),(59,43,0),(43,31,0),(27,15,0),(11,7,0),
    (0,0,255),(11,11,239),(19,19,223),(27,27,207),(35,35,191),(43,43,175),(47,47,159),(47,47,143),
    (47,47,127),(47,47,111),(47,47,95),(43,43,79),(35,35,63),(27,27,47),(19,19,31),(11,11,15),
    (43,0,0),(59,0,0),(75,7,0),(95,7,0),(111,15,0),(127,23,7),(147,31,7),(163,39,11),
    (183,51,15),(195,75,27),(207,99,43),(219,127,59),(227,151,79),(231,171,95),(239,191,119),(247,211,139),
    (167,123,59),(183,155,55),(199,195,55),(231,227,87),(127,191,255),(171,231,255),(215,255,255),(103,0,0),
    (139,0,0),(179,0,0),(215,0,0),(255,0,0),(255,243,147),(255,247,199),(255,255,255),(159,91,83),
]

BAYER_4X4 = np.array([
    [0, 8, 2, 10],
    [12, 4, 14, 6],
    [3, 11, 1, 9],
    [15, 7, 13, 5],
], dtype=np.float32) / 16.0 - 0.5

BAYER_8X8 = np.array([
    [0, 32, 8, 40, 2, 34, 10, 42],
    [48, 16, 56, 24, 50, 18, 58, 26],
    [12, 44, 4, 36, 14, 46, 6, 38],
    [60, 28, 52, 20, 62, 30, 54, 22],
    [3, 35, 11, 43, 1, 33, 9, 41],
    [51, 19, 59, 27, 49, 17, 57, 25],
    [15, 47, 7, 39, 13, 45, 5, 37],
    [63, 31, 55, 23, 61, 29, 53, 21],
], dtype=np.float32) / 64.0 - 0.5


IMAGE_EXTENSIONS = {".png", ".jpg", ".jpeg", ".bmp", ".tga", ".tif", ".tiff", ".webp"}


def build_output_path(input_path: str, resolution: int) -> str:
    base, _ext = os.path.splitext(input_path)
    return f"{base}_quake_{resolution}.png"


def build_edited_root(input_dir: str) -> str:
    """Default sibling output folder: placed next to input_dir, not inside it."""
    abs_dir = os.path.abspath(input_dir.rstrip("/\\"))
    parent = os.path.dirname(abs_dir)
    return os.path.join(parent, "_edited")


def iter_image_files(input_dir: str):
    for root, _dirs, files in os.walk(input_dir):
        for fname in files:
            if os.path.splitext(fname)[1].lower() in IMAGE_EXTENSIONS:
                yield os.path.join(root, fname)


def load_rgba(input_path: str, chroma_black: bool) -> np.ndarray:
    """Returns an HxWx4 float32 array (0-255) with a proper alpha channel."""
    img = Image.open(input_path)

    if img.mode in ("RGBA", "LA") or (img.mode == "P" and "transparency" in img.info):
        rgba = np.array(img.convert("RGBA")).astype(np.float32)
    else:
        rgb = np.array(img.convert("RGB")).astype(np.float32)
        if chroma_black:
            gray = rgb.mean(axis=2)
            alpha = np.clip((gray - 8) / (30 - 8), 0, 1) * 255.0
        else:
            alpha = np.full(rgb.shape[:2], 255.0, dtype=np.float32)
        rgba = np.dstack([rgb, alpha])

    return rgba


def downscale(rgba: np.ndarray, resolution: int) -> np.ndarray:
    """Alpha-aware downscale (premultiplied) to avoid dark/black fringing."""
    rgb = rgba[..., :3]
    alpha = rgba[..., 3]

    a_norm = (alpha / 255.0)[..., None]
    premult = rgb * a_norm

    premult_img = Image.fromarray(np.clip(premult, 0, 255).astype(np.uint8), "RGB")
    alpha_img = Image.fromarray(np.clip(alpha, 0, 255).astype(np.uint8), "L")

    premult_small = premult_img.resize((resolution, resolution), Image.LANCZOS)
    alpha_small = alpha_img.resize((resolution, resolution), Image.LANCZOS)

    premult_small_arr = np.array(premult_small).astype(np.float32)
    alpha_small_arr = np.array(alpha_small).astype(np.float32)

    safe_a = np.where(alpha_small_arr < 1e-3, 255.0, alpha_small_arr) / 255.0
    rgb_small = np.clip(premult_small_arr / safe_a[..., None], 0, 255)

    return np.dstack([rgb_small, alpha_small_arr])


def bayer_dither_to_palette(rgba_small: np.ndarray, palette: np.ndarray,
                             strength: float, matrix: np.ndarray) -> np.ndarray:
    rgb = rgba_small[..., :3]
    alpha = rgba_small[..., 3]
    h, w, _ = rgb.shape

    tiled = np.tile(matrix, (h // matrix.shape[0] + 1, w // matrix.shape[1] + 1))[:h, :w]
    perturbed = np.clip(rgb + tiled[..., None] * strength, 0, 255)

    flat = perturbed.reshape(-1, 3)
    diffs = flat[:, None, :] - palette[None, :, :]
    dists = np.einsum("ijk,ijk->ij", diffs, diffs)
    best = np.argmin(dists, axis=1)
    mapped = palette[best].reshape(h, w, 3)

    return np.dstack([mapped, alpha]).astype(np.uint8)


def process_image(input_path: str, resolution: int, palette: np.ndarray, matrix: np.ndarray,
                   strength: float, chroma_black: bool, upscale: int = None) -> Image.Image:
    rgba = load_rgba(input_path, chroma_black)
    small = downscale(rgba, resolution)
    out = bayer_dither_to_palette(small, palette, strength, matrix)

    out_img = Image.fromarray(out, "RGBA")
    if upscale:
        out_img = out_img.resize((upscale, upscale), Image.NEAREST)

    return out_img


def run_batch(input_dir: str, resolution: int, palette: np.ndarray, matrix: np.ndarray,
              strength: float, chroma_black: bool, upscale: int, out_root: str) -> None:
    input_dir_abs = os.path.abspath(input_dir.rstrip("/\\"))
    out_root_abs = os.path.abspath(out_root)

    if out_root_abs == input_dir_abs or out_root_abs.startswith(input_dir_abs + os.sep):
        print("Error: output folder can't be inside the input folder (originals must stay untouched).",
              file=sys.stderr)
        sys.exit(1)

    files = list(iter_image_files(input_dir))
    if not files:
        print(f"No image files found under: {input_dir}", file=sys.stderr)
        return

    processed = 0
    skipped = 0
    for in_path in files:
        rel_path = os.path.relpath(in_path, input_dir)
        rel_dir = os.path.dirname(rel_path)
        out_dir = os.path.join(out_root, rel_dir)
        out_name = os.path.splitext(os.path.basename(in_path))[0] + ".png"
        out_path = os.path.join(out_dir, out_name)

        try:
            out_img = process_image(in_path, resolution, palette, matrix, strength, chroma_black, upscale)
        except Exception as exc:  # keep going on a bad/corrupt file, don't kill the whole batch
            print(f"  skip (error): {rel_path} -> {exc}", file=sys.stderr)
            skipped += 1
            continue

        os.makedirs(out_dir, exist_ok=True)
        out_img.save(out_path)
        print(f"  {rel_path} -> {os.path.relpath(out_path, out_root)}")
        processed += 1

    print(f"\nDone: {processed} processed, {skipped} skipped.")
    print(f"Output folder: {out_root_abs}")


def main() -> None:
    parser = argparse.ArgumentParser(
        description="Convert an image into a Quake-1-style dithered, palette-quantized texture.",
        formatter_class=argparse.RawDescriptionHelpFormatter,
    )
    parser.add_argument("input_path", help="Path to a source image, or (with --batch) a directory")
    parser.add_argument("resolution", type=int, help="Target working resolution (square, e.g. 128)")
    parser.add_argument("--out", default=None, help="Output file path (single-file mode only)")
    parser.add_argument("--batch", action="store_true",
                         help="Recursively process every image in input_path (a directory). "
                              "Originals are never modified; results go to a sibling '_edited' folder.")
    parser.add_argument("--out-dir", default=None,
                         help="(batch mode) Custom output root folder, instead of the default sibling '_edited'")
    parser.add_argument("--strength", type=float, default=40.0, help="Dither strength (default: 40)")
    parser.add_argument("--chroma-black", action="store_true",
                         help="Make near-black background transparent (ignored if source already has alpha)")
    parser.add_argument("--upscale", type=int, default=None,
                         help="Upscale result to NxN with nearest-neighbor after processing")
    parser.add_argument("--matrix", type=int, choices=(4, 8), default=8,
                         help="Bayer matrix size: 8 (default, finer) or 4 (chunkier)")
    args = parser.parse_args()

    palette = np.array(QUAKE_PALETTE, dtype=np.float32)[:255]  # exclude index 255 (reserved marker color)
    matrix = BAYER_8X8 if args.matrix == 8 else BAYER_4X4

    if args.batch:
        if not os.path.isdir(args.input_path):
            print(f"Error: --batch requires input_path to be a directory: {args.input_path}", file=sys.stderr)
            sys.exit(1)
        out_root = args.out_dir or build_edited_root(args.input_path)
        run_batch(args.input_path, args.resolution, palette, matrix,
                  args.strength, args.chroma_black, args.upscale, out_root)
        return

    if not os.path.isfile(args.input_path):
        if os.path.isdir(args.input_path):
            print(f"Error: {args.input_path} is a directory. Pass --batch to process a whole folder.",
                  file=sys.stderr)
        else:
            print(f"Error: input file not found: {args.input_path}", file=sys.stderr)
        sys.exit(1)

    out_img = process_image(args.input_path, args.resolution, palette, matrix,
                             args.strength, args.chroma_black, args.upscale)

    out_path = args.out or build_output_path(args.input_path, args.resolution)
    out_img.save(out_path)
    print(f"Saved: {out_path} ({out_img.size[0]}x{out_img.size[1]})")


if __name__ == "__main__":
    main()