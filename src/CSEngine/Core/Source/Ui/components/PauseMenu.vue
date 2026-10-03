<!-- Created by Anton Piruev in 2026. Any direct commercial use of derivative work is strictly prohibited. -->
<script setup lang="ts">
import type { UiMenuState } from "../../Workers/Protocol/UiProtocol";

defineProps<{ menu: UiMenuState; disabled: boolean }>();
defineEmits<{ (e: "resume"): void; (e: "select", sceneId: string): void }>();
</script>

<template>
	<transition name="fade">
		<div v-if="menu.visible" class="menu-backdrop">
			<q-card dark class="menu-card">
				<q-card-section>
					<div class="text-h6">{{ menu.mode === "start" ? "Lantern Festival" : "Paused" }}</div>
					<div class="text-caption text-grey-5">
						{{ menu.mode === "start" ? "Click Play to take control of the mouse." : "Mouse released. Resume to keep playing, or pick another scene." }}
					</div>
				</q-card-section>

				<q-card-section class="q-pt-none">
					<q-btn
						color="amber"
						text-color="black"
						unelevated
						no-caps
						class="full-width"
						:label="menu.mode === 'start' ? 'Play' : 'Resume'"
						:disable="disabled"
						@click="$emit('resume')"
					/>
				</q-card-section>

				<q-separator dark />

				<q-card-section class="q-pb-none text-overline text-grey-5">Test scenes</q-card-section>
				<q-list dark separator>
					<q-item
						v-for="scene in menu.scenes"
						:key="scene.id"
						clickable
						v-ripple
						:disable="disabled"
						:active="scene.id === menu.currentSceneId"
						active-class="text-amber"
						@click="$emit('select', scene.id)"
					>
						<q-item-section>
							<q-item-label>{{ scene.name }}</q-item-label>
							<q-item-label caption lines="3">{{ scene.description }}</q-item-label>
						</q-item-section>
						<q-item-section side v-if="scene.id === menu.currentSceneId">
							<q-badge color="amber" text-color="black" label="current" />
						</q-item-section>
					</q-item>
				</q-list>
			</q-card>
		</div>
	</transition>
</template>

<style scoped>
.menu-backdrop {
	position: fixed;
	inset: 0;
	display: flex;
	align-items: center;
	justify-content: center;
	background: rgba(8, 10, 16, 0.72);
	pointer-events: auto;
	z-index: 20;
}

.menu-card {
	width: min(460px, 92vw);
	background: #151922;
}

.fade-enter-active,
.fade-leave-active {
	transition: opacity 0.15s ease;
}

.fade-enter-from,
.fade-leave-to {
	opacity: 0;
}
</style>
