#!/usr/bin/env bash
# Quick start of the Electron desktop app: the Project Manager (and from there the UI Designer).
#
# Usage: bash devops/start-desktop.sh [--designer] [--build]
#   --designer   open the UI Designer on its own (it asks which project to use)
#   --build      build the app first (devops/build-all.sh --skip-physics)
set -euo pipefail

DESIGNER=0; BUILD=0
for arg in "$@"; do
  case "$arg" in
    --designer) DESIGNER=1 ;;
    --build)    BUILD=1 ;;
    -h|--help)  sed -n '2,6p' "${BASH_SOURCE[0]}"; exit 0 ;;
    *) echo "Unknown option: $arg" >&2; exit 2 ;;
  esac
done

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
ENGINE="$(cd "$SCRIPT_DIR/.." && pwd)/src/CSEngine"
DESKTOP="$ENGINE/Programs/Desktop"
BINARIES="$ENGINE/Binaries"

if [ "$BUILD" -eq 1 ]; then
  bash "$SCRIPT_DIR/build-all.sh" --skip-physics
fi

# Dev-server URLs (CSE_PROJECT_BROWSER_URL / CSE_UI_DESIGNER_URL) replace the built pages, so only check without them.
MISSING=()
[ -f "$BINARIES/Programs/Desktop/main.cjs" ]  || MISSING+=("Desktop (main.cjs)")
[ -f "$BINARIES/Programs/Desktop/preload.cjs" ] || MISSING+=("Desktop (preload.cjs)")
if [ -z "${CSE_PROJECT_BROWSER_URL:-}" ]; then
  [ -f "$BINARIES/Modules/Editor/ProjectBrowser/index.html" ] || MISSING+=("Project Browser")
fi
if [ -z "${CSE_UI_DESIGNER_URL:-}" ]; then
  [ -f "$BINARIES/Modules/Editor/UIDesigner/index.html" ] || MISSING+=("UI Designer")
fi
if [ "${#MISSING[@]}" -gt 0 ]; then
  echo "Not built yet: ${MISSING[*]}" >&2
  echo "Run: bash devops/build-all.sh --skip-physics   (or: bash devops/start-desktop.sh --build)" >&2
  exit 1
fi

cd "$DESKTOP"
if [ "$DESIGNER" -eq 1 ]; then
  exec pnpm exec electron . --ui-designer
else
  exec pnpm start
fi
