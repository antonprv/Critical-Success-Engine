# quake_texturize.py — How to Use

Converts any image (or a whole folder of images) into a Quake 1-style
texture: downscales to a low working resolution, applies Bayer ordered
dithering, and quantizes colors to the real 256-color Quake palette
(`host_quakepal`).

---

## Setup

```bash
# create a venv
python3.13 -m venv venv

# activate it
source venv/bin/activate            # Linux / macOS
venv\Scripts\Activate.ps1           # Windows PowerShell
venv\Scripts\activate.bat           # Windows cmd

# install dependencies
pip install -r requirements.txt
```

Deactivate the venv when done: `deactivate`

---

## Basic syntax

```bash
python3 quake_texturize.py <input_path> <resolution> [options]
```

- `input_path` — path to an image, or (with `--batch`) path to a folder
- `resolution` — target working resolution in pixels (square, e.g. `128`)

---

## Single file

### Simple processing

```bash
python3 quake_texturize.py texture.png 128
```

Saves the result next to the original as `texture_quake_128.png`.
The original is never touched.

### With transparent background (black → alpha)

For photos on a black backdrop (moon, planets, space, etc.). If the file
already has its own alpha channel, this flag is ignored and the existing
transparency is used instead.

```bash
python3 quake_texturize.py moon.jpg 128 --chroma-black
```

### Specify a custom output path/name

```bash
python3 quake_texturize.py sprite.png 96 --out output/sprite_quake.png
```

### Upscale back afterward (staying pixelated)

Downscales to 128 for the dithering pass, then upscales with
nearest-neighbor to 256 — the image stays crisp and "chunky" instead of
blurring.

```bash
python3 quake_texturize.py texture.jpg 128 --upscale 256
```

### Adjust dither strength

Default is `40`. Higher = more visible grain/pattern, lower = softer.

```bash
python3 quake_texturize.py noise.png 64 --strength 30
```

### Coarser grid (4×4 instead of 8×8 Bayer)

```bash
python3 quake_texturize.py texture.png 128 --matrix 4
```

### Combining options

```bash
python3 quake_texturize.py moon.jpg 128 --chroma-black --strength 50 --upscale 256 --matrix 4
```

---

## Batch-processing a folder (`--batch`)

Recursively walks every image in a folder and saves the edited copies into
a separate `_edited` folder, created **outside** the source folder (next to
it, not inside it), mirroring the full subfolder structure.
**Originals are never modified** — the script only reads them.

Supported extensions: `.png .jpg .jpeg .bmp .tga .tif .tiff .webp`
(any other files in the folder are ignored).

### Process a whole folder

```bash
python3 quake_texturize.py textures/ 128 --batch
```

If `textures/` lives in `C:/project/`, the result will appear in
`C:/project/_edited/`, with the same nested subfolder structure.

### Batch + transparent background for every file

```bash
python3 quake_texturize.py textures/ 128 --batch --chroma-black
```

### Batch with upscaling and a custom dither strength

```bash
python3 quake_texturize.py textures/ 128 --batch --upscale 256 --strength 35
```

### Use a custom output folder instead of `_edited`

```bash
python3 quake_texturize.py textures/ 128 --batch --out-dir /path/to/output_folder
```

> If you try to point `--out-dir` inside the source folder itself, the
> script will refuse to run, to eliminate any risk of touching the
> originals.

### Console output

```
  noise1.png -> noise1.png
  subfolder/moon.jpg -> subfolder/moon.png
  subfolder/noise2.png -> subfolder/noise2.png

Done: 3 processed, 0 skipped.
Output folder: /home/user/project/_edited
```

Files that fail to load (corrupt/unreadable) don't stop the whole batch —
they're skipped with a `skip (error)` note in the output, and processing
continues with the rest.

---

## Full options reference

| Flag                | Mode        | Default        | Description                                                                 |
|----------------------|-------------|----------------|-------------------------------------------------------------------------------|
| `input_path`          | both        | —              | A file, or (with `--batch`) a folder                                          |
| `resolution`          | both        | —              | Working resolution, e.g. `128`                                                |
| `--out PATH`           | single      | auto-generated | Output file path/name                                                         |
| `--batch`              | —           | off            | Enable recursive folder processing                                            |
| `--out-dir PATH`        | batch       | `_edited`      | Custom output root folder instead of the default `_edited`                    |
| `--strength FLOAT`      | both        | `40`           | Bayer dither strength (0–255)                                                 |
| `--chroma-black`        | both        | off            | Make near-black background transparent                                        |
| `--upscale N`            | both        | no upscale     | Upscale the result to NxN with nearest-neighbor                                |
| `--matrix {4,8}`         | both        | `8`            | Bayer matrix size: `8` = finer, `4` = coarser/more visible                    |

---

## Quick cheat sheet

```bash
# single file, basic
python3 quake_texturize.py file.png 128

# single file, moon/space background → transparent
python3 quake_texturize.py moon.jpg 128 --chroma-black

# whole folder of textures at once
python3 quake_texturize.py textures/ 128 --batch

# whole folder, with transparency and upscaled back to 256
python3 quake_texturize.py textures/ 128 --batch --chroma-black --upscale 256
```