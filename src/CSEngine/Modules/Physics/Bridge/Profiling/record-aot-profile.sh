#!/usr/bin/env bash
# Records Profiling/aot.profile and rebuilds the AOT release bundle with it. See README.md.
set -euo pipefail
here="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
project="$here/../Bridge.csproj"

# The main build (SIMD) and the fallback for browsers without WebAssembly SIMD each have their own profile: without SIMD,
# Vector<T> is .NET's managed code, other methods than the SIMD build runs.
record() {
	local binaries="$1" profile="$2"
	shift 2
	dotnet publish "$project" -c Release -p:CseAotProfile=true "$@"
	bundle="$(CSE_PHYSICS_BINARIES="$binaries" "$here/unpack-bundle.sh")"
	node "$here/record-aot-profile.mjs" "$bundle" "$here/$profile"
	rm -rf "$(dirname "$bundle")"
	dotnet publish "$project" -c Release "$@"
}

record Physics aot.profile
record PhysicsNoSimd aot.nosimd.profile -p:CseNoSimd=true
