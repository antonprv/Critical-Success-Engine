// Created by Anton Piruev in 2026.
// Any direct commercial use of derivative work is strictly prohibited.

/** Owns the #loading overlay's label/progress-bar/hide behavior - nothing about booting the engine itself. */
export class LoadingScreen {
	private readonly _element: HTMLElement | null;
	private readonly _barElement: HTMLElement | null;

	public constructor() {
		this._element = document.getElementById("loading");
		this._barElement = document.getElementById("loading-bar");
	}

	public SetLabel(text: string): void {
		if (this._element) {
			this._element.querySelector(".loading-label")!.textContent = text;
		}
	}

	public SetFraction(fraction: number): void {
		if (this._barElement) {
			this._barElement.style.width = `${Math.round(fraction * 100)}%`;
		}
	}

	public Hide(): void {
		this._element?.classList.add("loading-hidden");
		setTimeout(() => this._element?.remove(), 300);
	}
}
