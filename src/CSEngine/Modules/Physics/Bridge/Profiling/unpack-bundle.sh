#!/usr/bin/env bash
# Copies the published AppBundle into a new temp dir with its .wasm.gz decompressed (Node can't load the .gz assets
# the way physics.worker.ts does) and prints that dir.
set -euo pipefail
here="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
# CSE_PHYSICS_BINARIES=PhysicsNoSimd picks the build for browsers without WebAssembly SIMD.
bundle="$here/../../../../Binaries/${CSE_PHYSICS_BINARIES:-Physics}/Release/net10.0/browser-wasm/AppBundle"
out="$(mktemp -d)"
cp -r "$bundle" "$out/"
gunzip "$out"/AppBundle/_framework/*.wasm.gz
echo "$out/AppBundle"
