// Created by Anton Piruev in 2026.
// Any direct commercial use of derivative work is strictly prohibited.

import { reactive } from "vue";
import { CreateInitialUiState, type UiState } from "../Workers/Protocol/UiProtocol";

/** What the Vue components can ask the engine to do - implemented by UiBridge, injected so components stay DOM/worker-free. */
export interface UiActions {
	/** Must be called from a click handler: pointer lock needs a user gesture. */
	Resume(): void;
	SelectScene(sceneId: string): void;
}

/**
 * The single reactive object Vue renders. UiWorker owns the real state and pushes whole-section patches; this store is a
 * mirror with zero logic of its own (see UiProtocol.ts for why the UI is split this way).
 */
export class UiStore {
	public readonly State: UiState = reactive(CreateInitialUiState());

	public Actions: UiActions = {
		Resume: () => undefined,
		SelectScene: () => undefined,
	};

	public ApplyPatch(patch: Partial<UiState>): void {
		if (patch.loading) Object.assign(this.State.loading, patch.loading);
		if (patch.menu) Object.assign(this.State.menu, patch.menu);
		if (patch.hud) Object.assign(this.State.hud, patch.hud);
	}
}
