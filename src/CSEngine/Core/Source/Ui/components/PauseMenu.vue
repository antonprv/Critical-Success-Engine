<!-- Created by Anton Piruev in 2026. Any direct commercial use of derivative work is strictly prohibited. -->
<script setup lang="ts">
import { computed } from "vue";
import type { UiMenuState } from "../../Workers/Protocol/UiProtocol";
import Taskbar from "./Taskbar.vue";

const props = defineProps<{ menu: UiMenuState; disabled: boolean }>();
defineEmits<{ (e: "resume"): void; (e: "select", sceneId: string): void }>();

const isStart = computed(() => props.menu.mode === "start");
const sceneCount = computed(() => (props.menu.scenes.length === 1 ? "1 scene" : `${props.menu.scenes.length} scenes`));
const currentName = computed(() => props.menu.scenes.find((s) => s.id === props.menu.currentSceneId)?.name);
</script>

<template>
	<transition name="fade">
		<div v-if="menu.visible" class="menu-backdrop">
			<div class="menu-desktop">
				<section class="menu-card" role="dialog" aria-labelledby="menu-title">
					<header class="titlebar">
						<span id="menu-title" class="titlebar__text">Lantern Festival</span>
						<!-- Closing the menu window goes back to the game, like closing a dialog returns you to the app. -->
						<button class="titlebar__close" type="button" aria-label="Close menu" title="Close" :disabled="disabled" @click="$emit('resume')" />
					</header>

					<div class="window-body">
						<aside class="task-pane">
							<div class="task-group">
								<div class="task-group__title">{{ isStart ? "Ready" : "Paused" }}</div>
								<div class="task-group__body">
									<button class="play-button" type="button" :disabled="disabled" @click="$emit('resume')">
										{{ isStart ? "Play" : "Resume" }}
									</button>
									<p class="task-group__hint">
										{{ isStart ? "Click Play to take control of the mouse." : "Mouse released. Resume to keep playing, or pick another scene." }}
									</p>
								</div>
							</div>
						</aside>

						<div class="scene-view">
							<div class="scene-view__header" aria-hidden="true">
								<span class="col-name">Name</span>
								<span class="col-description">Description</span>
							</div>
							<q-list class="scene-list">
								<q-item
									v-for="scene in menu.scenes"
									:key="scene.id"
									clickable
									:disable="disabled"
									class="scene-row"
									:class="{ 'scene-row--current': scene.id === menu.currentSceneId }"
									@click="$emit('select', scene.id)"
								>
									<q-item-section class="col-name">
										<span class="scene-row__name">{{ scene.name }}</span>
										<span v-if="scene.id === menu.currentSceneId" class="scene-row__current">current</span>
									</q-item-section>
									<q-item-section class="col-description">{{ scene.description }}</q-item-section>
								</q-item>
							</q-list>
						</div>
					</div>

					<footer class="statusbar">
						<span class="statusbar__panel">{{ sceneCount }}</span>
						<span class="statusbar__panel statusbar__panel--wide">{{ currentName ?? "No scene loaded" }}</span>
					</footer>
				</section>
			</div>

			<Taskbar title="Lantern Festival" />
		</div>
	</transition>
</template>

<style scoped>
.menu-backdrop {
	position: fixed;
	inset: 0;
	display: flex;
	flex-direction: column;
	/* The XP desktop: the paused game stays visible through its plain blue. */
	background: rgba(0, 78, 152, 0.72);
	pointer-events: auto;
	z-index: 20;
	font: 11px/1.4 var(--xp-font);
	color: #000;
}

.menu-desktop {
	flex: 1;
	display: flex;
	align-items: center;
	justify-content: center;
	padding: 12px;
	min-height: 0;
}

/* ---- the window ---- */

.menu-card {
	display: flex;
	flex-direction: column;
	width: min(640px, 100%);
	max-height: 100%;
	border: 1px solid var(--xp-blue-dark);
	border-radius: 8px 8px 0 0;
	background: var(--xp-blue);
	box-shadow: 3px 4px 10px rgba(0, 0, 0, 0.5);
	overflow: hidden;
}

.titlebar {
	display: flex;
	align-items: center;
	flex: none;
	height: 29px;
	padding: 0 5px 0 8px;
	background: linear-gradient(180deg,
		#0997ff 0%, #0053ee 9%, #0050ee 18%, #0066ff 50%, #0060fc 86%, #0055eb 92%, #003dd7 100%);
}

.titlebar__text {
	flex: 1;
	font: bold 13px var(--xp-title-font);
	color: #fff;
	text-shadow: 1px 1px 0 #0f1089;
	white-space: nowrap;
	overflow: hidden;
	text-overflow: ellipsis;
}

.titlebar__close {
	position: relative;
	width: 21px;
	height: 21px;
	border: 1px solid #fff;
	border-radius: 3px;
	background: radial-gradient(circle at 90% 90%, #cc4600 0%, #dc6527 55%, #cd7546 70%, #ffccb2 92%, #fff 100%);
	cursor: pointer;
}

/* The white X. */
.titlebar__close::before,
.titlebar__close::after {
	content: "";
	position: absolute;
	top: 3px;
	left: 8px;
	width: 2px;
	height: 13px;
	background: #fff;
	transform: rotate(45deg);
}

.titlebar__close::after {
	transform: rotate(-45deg);
}

.titlebar__close:hover {
	background: radial-gradient(circle at 90% 90%, #e2501c 0%, #f08049 55%, #ed9b6f 70%, #ffd8c4 92%, #fff 100%);
}

.titlebar__close:active {
	background: radial-gradient(circle at 10% 10%, #cc4600 0%, #dc6527 55%, #cd7546 70%, #ffccb2 92%, #fff 100%);
}

.titlebar__close:disabled {
	filter: grayscale(0.7);
	opacity: 0.7;
	cursor: default;
}

.titlebar__close:focus-visible {
	outline: 1px dotted #fff;
	outline-offset: 2px;
}

.window-body {
	display: grid;
	grid-template-columns: 196px 1fr;
	min-height: 0;
	flex: 1;
	margin: 0 3px;
	background: var(--xp-beige);
}

/* ---- left: the Explorer task pane ---- */

.task-pane {
	padding: 12px 10px;
	background: linear-gradient(180deg, #7ba2e7 0%, #6375d6 100%);
}

.task-group__title {
	padding: 5px 10px;
	border-radius: 4px 4px 0 0;
	background: linear-gradient(90deg, #fff 0%, #c6d3f7 100%);
	font: bold 12px var(--xp-font);
	color: #215dc6;
}

.task-group__body {
	padding: 12px 10px 10px;
	background: #d6dff7;
	border: 1px solid #fff;
	border-top: none;
}

.task-group__hint {
	margin: 10px 0 0;
	color: #215dc6;
}

/* Play/Resume: the green Start button, the one thing on screen that asks to be pressed. */
.play-button {
	display: block;
	width: 100%;
	padding: 7px 18px 8px 16px;
	border: 1px solid #1e6b1e;
	border-radius: 4px 18px 18px 4px;
	background: linear-gradient(180deg, #5eb55a 0%, #3c9a3c 12%, #389838 50%, #2f8a2f 88%, #217221 100%);
	box-shadow: inset 0 1px 0 rgba(255, 255, 255, 0.45), inset 0 -2px 3px rgba(0, 0, 0, 0.25), 1px 1px 2px rgba(0, 0, 0, 0.3);
	font: italic bold 20px var(--xp-title-font);
	color: #fff;
	text-align: left;
	text-shadow: 1px 1px 1px rgba(0, 0, 0, 0.55);
	cursor: pointer;
}

.play-button:hover {
	background: linear-gradient(180deg, #78cb73 0%, #4fb04c 12%, #48aa45 50%, #3a9a37 88%, #2a822a 100%);
}

.play-button:active {
	background: linear-gradient(180deg, #2a822a 0%, #328f32 50%, #3c9a3c 100%);
	box-shadow: inset 1px 2px 3px rgba(0, 0, 0, 0.45);
}

.play-button:focus-visible {
	outline: 1px dotted #fff;
	outline-offset: -5px;
}

.play-button:disabled {
	filter: grayscale(0.8);
	opacity: 0.6;
	cursor: default;
}

/* ---- right: the scenes in Explorer's details view ---- */

.scene-view {
	display: flex;
	flex-direction: column;
	min-height: 0;
	margin: 10px;
	border: 1px solid var(--xp-list-border);
	background: #fff;
}

.scene-view__header,
.scene-row {
	display: grid;
	grid-template-columns: minmax(120px, 2fr) 3fr;
}

.scene-view__header {
	flex: none;
	background: linear-gradient(180deg, #fff 0%, #f6f5f0 70%, #ebeadb 100%);
	border-bottom: 1px solid #d6d2c2;
	color: #000;
}

.scene-view__header > span {
	padding: 3px 6px;
	border-right: 1px solid #d6d2c2;
}

.scene-list {
	overflow-y: auto;
	padding: 2px 0;
}

.scene-row {
	min-height: 0;
	padding: 0;
	font: 11px/1.4 var(--xp-font);
	color: #000;
}

.scene-row :deep(.q-focus-helper) {
	display: none; /* Quasar's hover wash; XP highlights rows its own way */
}

.scene-row .col-name,
.scene-row .col-description {
	padding: 4px 6px;
	margin: 0;
}

.scene-row .col-name {
	flex-direction: row;
	align-items: flex-start;
	justify-content: flex-start;
	gap: 6px;
}

.scene-row__name {
	font-weight: bold;
}

.scene-row__current {
	padding: 0 5px;
	border: 1px solid currentColor;
	border-radius: 2px;
	font-size: 10px;
	opacity: 0.85;
}

.scene-row .col-description {
	color: #444;
}

.scene-row:hover {
	background: #e8eef9;
}

.scene-row--current,
.scene-row--current:hover {
	background: var(--xp-select);
	color: #fff;
}

.scene-row--current .col-description {
	color: #e8eef9;
}

.scene-row:focus-visible {
	outline: 1px dotted #000;
	outline-offset: -2px;
}

/* ---- status bar ---- */

.statusbar {
	display: flex;
	gap: 3px;
	flex: none;
	margin: 0 3px 3px;
	padding: 3px 3px 2px;
	background: var(--xp-beige);
	border-top: 1px solid var(--xp-beige-shadow);
}

.statusbar__panel {
	padding: 1px 6px;
	border: 1px solid;
	border-color: var(--xp-beige-shadow) #fff #fff var(--xp-beige-shadow);
	white-space: nowrap;
}

.statusbar__panel--wide {
	flex: 1;
	overflow: hidden;
	text-overflow: ellipsis;
}

.fade-enter-active,
.fade-leave-active {
	transition: opacity 0.15s ease;
}

.fade-enter-from,
.fade-leave-to {
	opacity: 0;
}

@media (max-width: 560px) {
	.window-body {
		grid-template-columns: 1fr;
		overflow-y: auto;
	}

	.scene-view__header,
	.scene-row {
		grid-template-columns: 1fr;
	}

	.scene-view__header .col-description {
		display: none;
	}
}

@media (prefers-reduced-motion: reduce) {
	.fade-enter-active,
	.fade-leave-active {
		transition: none;
	}
}
</style>
