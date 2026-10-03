<!-- Created by Anton Piruev in 2026. Any direct commercial use of derivative work is strictly prohibited. -->
<script setup lang="ts">
import type { UiLoadingState } from "../../Workers/Protocol/UiProtocol";
import XpProgress from "./XpProgress.vue";

defineProps<{ loading: UiLoadingState }>();
</script>

<template>
	<transition name="fade">
		<div v-if="loading.visible" class="loading-overlay">
			<!-- The XP start-up screen: black, the name in white, the progress capsule under it, the maker bottom right. -->
			<div class="boot">
				<h1 class="boot__title">Lantern Festival</h1>
				<XpProgress class="boot__bar" variant="boot" :value="loading.fraction" label="Loading" />
				<p class="boot__label">{{ loading.label }}</p>
			</div>

			<p class="engine-mark">Critical Success Engine</p>
		</div>
	</transition>
</template>

<style scoped>
.loading-overlay {
	position: fixed;
	inset: 0;
	display: flex;
	align-items: center;
	justify-content: center;
	overflow: hidden;
	background: var(--xp-boot);
	pointer-events: auto;
	z-index: 30;
	font-family: var(--xp-font);
}

.boot {
	display: flex;
	flex-direction: column;
	align-items: center;
	width: min(720px, 94vw);
	margin-top: -6vh;
}

/* The one loud thing on the screen: the name, set the way XP set its own on the start-up screen. */
.boot__title {
	margin: 0 0 34px;
	font: italic bold clamp(30px, 8.4vw, 60px)/1.05 var(--xp-title-font);
	letter-spacing: -0.015em;
	white-space: nowrap;
	color: #fff;
	text-align: center;
}

.boot__bar {
	width: min(176px, 56vw);
}

.boot__label {
	min-height: 1.4em;
	margin: 16px 0 0;
	font-size: 12px;
	color: #9a9a9a;
}

/* Where XP put its maker's name: bottom right, small, white. */
.engine-mark {
	position: absolute;
	right: 22px;
	bottom: 16px;
	margin: 0;
	font: italic bold 15px var(--xp-title-font);
	color: #fff;
}

.fade-enter-active,
.fade-leave-active {
	transition: opacity 0.25s ease;
}

.fade-enter-from,
.fade-leave-to {
	opacity: 0;
}

@media (prefers-reduced-motion: reduce) {
	.fade-enter-active,
	.fade-leave-active {
		transition: none;
	}
}
</style>
