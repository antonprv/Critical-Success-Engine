// Created by Anton Piruev in 2026.
// Any direct commercial use of derivative work is strictly prohibited.

import type { Scene } from "@babylonjs/core/scene";

/**
 * Wires up Shift+Ctrl+Alt+I to toggle the Babylon Inspector.
 *
 * IMPORTANT: this function must only ever be called from behind an
 * `if (__DEV__)` check. The dynamic import below is what keeps
 * `@babylonjs/inspector` (several MB) out of the production bundle
 * entirely — webpack only creates a request for it once the import()
 * actually executes, and in production that branch is unreachable.
 */
export function enableInspectorToggle(scene: Scene): void {
    window.addEventListener("keydown", (event) => {
        const isToggleCombo =
            event.shiftKey &&
            event.ctrlKey &&
            event.altKey &&
            (event.key === "I" || event.key === "i");

        if (!isToggleCombo) {
            return;
        }

        if (scene.debugLayer.isVisible()) {
            scene.debugLayer.hide();
            return;
        }

        // Loaded on first use only, not at startup.
        import("@babylonjs/inspector")
            .then(() => scene.debugLayer.show({ overlay: true }))
            .catch((error) => console.error("Failed to load Inspector", error));
    });
}
