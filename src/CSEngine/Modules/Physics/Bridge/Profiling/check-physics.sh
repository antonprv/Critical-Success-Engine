#!/usr/bin/env bash
# Smoke test (and optional benchmark) of the currently published bundle: check-physics.sh [500,2000]
# CSE_PHYSICS_BINARIES=PhysicsNoSimd checks the build for browsers without WebAssembly SIMD instead.
set -euo pipefail
here="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
bundle="$("$here/unpack-bundle.sh")"
trap 'rm -rf "$(dirname "$bundle")"' EXIT
node "$here/check-physics.mjs" "$bundle" "$@"
