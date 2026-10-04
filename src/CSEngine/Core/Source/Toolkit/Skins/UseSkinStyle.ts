// Created by Anton Piruev in 2026.
// Any direct commercial use of derivative work is strictly prohibited.

import { onUnmounted, watchEffect } from "vue";
import { GenerateSkinCss, type Skin } from "./Skin";

/** Keeps a <style> in the document head holding the skin's CSS, for as long as the component lives. */
export function UseSkinStyle(skin: () => Skin | null): void {
	const style = document.createElement("style");
	style.dataset["winSkin"] = "";
	document.head.appendChild(style);
	watchEffect(() => {
		const current = skin();
		style.textContent = current ? GenerateSkinCss(current) : "";
	});
	onUnmounted(() => style.remove());
}
