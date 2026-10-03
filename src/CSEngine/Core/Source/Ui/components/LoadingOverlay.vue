<!-- Created by Anton Piruev in 2026. Any direct commercial use of derivative work is strictly prohibited. -->
<script setup lang="ts">
import type { UiLoadingState } from "../../Workers/Protocol/UiProtocol";

defineProps<{ loading: UiLoadingState }>();
</script>

<template>
	<transition name="fade">
		<div v-if="loading.visible" class="loading-overlay">
			<div class="column items-center q-gutter-md" style="width: min(360px, 80vw)">
				<q-spinner-orbit color="amber" size="56px" />
				<div class="text-subtitle1 text-grey-4">{{ loading.label }}</div>
				<q-linear-progress
					:value="loading.fraction"
					color="amber"
					track-color="grey-9"
					rounded
					size="6px"
					animation-speed="150"
				/>
			</div>
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
	background: #0b0d12;
	pointer-events: auto;
	z-index: 30;
}

.fade-enter-active,
.fade-leave-active {
	transition: opacity 0.25s ease;
}

.fade-enter-from,
.fade-leave-to {
	opacity: 0;
}
</style>
