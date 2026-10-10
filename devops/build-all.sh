#!/usr/bin/env bash
# Builds everything step by step: dependencies, physics (wasm), Project Browser, UI Designer, Desktop (Electron).
#
# Usage: bash devops/build-all.sh [--skip-install] [--skip-physics] [--web]
#   --skip-install   do not run `pnpm install`
#   --skip-physics   do not publish the physics wasm (the game then runs without a simulation)
#   --web            also build the web game (Core) into src/CSEngine/Binaries/Core
set -euo pipefail

SKIP_INSTALL=0; SKIP_PHYSICS=0; WEB=0
for arg in "$@"; do
  case "$arg" in
    --skip-install) SKIP_INSTALL=1 ;;
    --skip-physics) SKIP_PHYSICS=1 ;;
    --web)          WEB=1 ;;
    -h|--help)      sed -n '2,8p' "${BASH_SOURCE[0]}"; exit 0 ;;
    *) echo "Unknown option: $arg" >&2; exit 2 ;;
  esac
done

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
ROOT="$(cd "$SCRIPT_DIR/.." && pwd)"
ENGINE="$ROOT/src/CSEngine"
EDITOR="$ENGINE/Modules/Editor"
STEP=0
WARNINGS=()

step() { STEP=$((STEP + 1)); printf '\n\033[36m[%s] %s\033[0m\n' "$STEP" "$1"; }
warn() { printf '\033[33mWARNING: %s\033[0m\n' "$1"; WARNINGS+=("$1"); }
die()  { printf '\033[31mERROR: %s\033[0m\n' "$1" >&2; exit 1; }

# --- 0. Prerequisites ---
step "Checking prerequisites"
command -v node >/dev/null 2>&1 || die "Node.js is not installed (need 22.12+)."
command -v pnpm >/dev/null 2>&1 || die "pnpm is not installed (need 10+)."
NODE_VERSION="$(node -v | sed 's/^v//')"
IFS='.' read -r NODE_MAJOR NODE_MINOR _ <<< "$NODE_VERSION"
if [ "$NODE_MAJOR" -lt 22 ] || { [ "$NODE_MAJOR" -eq 22 ] && [ "$NODE_MINOR" -lt 12 ]; }; then
  die "Node $NODE_VERSION found, need 22.12 or newer."
fi
echo "node $NODE_VERSION, pnpm $(pnpm -v)"

# --- 1. Dependencies ---
if [ "$SKIP_INSTALL" -eq 1 ]; then
  step "Dependencies: skipped (--skip-install)"
else
  step "Installing dependencies (pnpm workspace)"
  (cd "$ENGINE" && pnpm install)
fi

# --- 2. Physics ---
if [ "$SKIP_PHYSICS" -eq 1 ]; then
  step "Physics: skipped (--skip-physics)"
else
  step "Publishing physics (wasm)"
  BRIDGE="$ENGINE/Physics/Bridge/Bridge.csproj"
  if ! command -v dotnet >/dev/null 2>&1; then
    warn "dotnet not found - physics skipped (the game runs without a simulation)."
  elif [ ! -f "$BRIDGE" ]; then
    warn "$BRIDGE not found - physics skipped."
  else
    if ! dotnet workload list 2>/dev/null | grep -q 'wasm-tools'; then
      warn "Workload wasm-tools looks missing (dotnet workload install wasm-tools); trying anyway."
    fi
    if dotnet publish "$BRIDGE" -c Release -p:TrimmerSingleWarn=false -v:normal > "$SCRIPT_DIR/publish.log"; then
      echo "Physics published. Log: devops/publish.log"
    else
      tail -n 30 "$SCRIPT_DIR/publish.log" || true
      warn "Physics publish failed - see devops/publish.log. Continuing without it."
    fi
  fi
fi

# --- 3. Project Browser ---
step "Building Project Browser"
(cd "$EDITOR/ProjectBrowser" && pnpm build)

# --- 4. UI Designer ---
step "Building UI Designer"
(cd "$EDITOR/UIDesigner" && pnpm build)

# --- 5. Desktop (Electron) ---
step "Building Desktop (Electron main process + preload)"
(cd "$ENGINE/Programs/Desktop" && pnpm build)

# --- 6. Optional: web game ---
if [ "$WEB" -eq 1 ]; then
  step "Building the web game (Core)"
  (cd "$ENGINE/Core" && pnpm build)
fi

printf '\n\033[32mDone.\033[0m Start the Project Manager with: bash devops/start-desktop.sh\n'
if [ "${#WARNINGS[@]}" -gt 0 ]; then
  printf '\033[33mWarnings:\033[0m\n'
  for w in "${WARNINGS[@]}"; do echo "  - $w"; done
fi
