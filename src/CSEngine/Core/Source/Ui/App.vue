<!-- Created by Anton Piruev in 2026. Any direct commercial use of derivative work is strictly prohibited. -->
<script setup lang="ts">
import { inject } from "vue";
import type { UiStore } from "./UiStore";
import Hud from "./components/Hud.vue";
import LoadingOverlay from "./components/LoadingOverlay.vue";
import PauseMenu from "./components/PauseMenu.vue";

const store = inject<UiStore>("uiStore")!;
const state = store.State;
</script>

<template>
	<div class="ui-root">
		<Hud
			v-if="state.hud.visible && !state.menu.visible && !state.loading.visible"
			:lines="state.hud.lines"
			:bars="state.hud.bars"
		/>
		<PauseMenu
			v-if="!state.documentScreens"
			:menu="state.menu"
			:disabled="state.loading.visible"
			@resume="store.Actions.Resume()"
			@select="(id: string) => store.Actions.SelectScene(id)"
		/>
		<LoadingOverlay v-if="!state.documentScreens" :loading="state.loading" />
	</div>
</template>

<style>
.ui-root {
	position: fixed;
	inset: 0;
	/* The canvas below must keep receiving pointer events while only the HUD is up; overlays re-enable them. */
	pointer-events: none;
	font-family: var(--xp-font);
	color: #000;
}
</style>
