<!-- Created by Anton Piruev in 2026. Any direct commercial use of derivative work is strictly prohibited. -->
<script setup lang="ts">
import type { ToastController } from "../Controls/ToastController";
import { UseControl } from "../Core/UseControl";

const props = defineProps<{ controller: ToastController; }>();
const c = UseControl(props.controller);
defineExpose({ controller: c });
</script>

<template>
	<TransitionGroup name="win-toast" tag="div" class="win-toasts" role="status" aria-live="polite">
		<div v-for="(text, index) in c.Items" :key="`${index}:${text}`" class="win-toast">{{ text }}</div>
	</TransitionGroup>
</template>
