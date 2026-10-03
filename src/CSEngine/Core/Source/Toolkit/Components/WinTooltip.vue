<!-- Created by Anton Piruev in 2026. Any direct commercial use of derivative work is strictly prohibited. -->
<script setup lang="ts">
import type { TooltipController } from "../Controls/TooltipController";
import { ForwardEvents, UseControl } from "../Core/UseControl";

const props = defineProps<{ controller: TooltipController; }>();
const emit = defineEmits<{ show: []; hide: []; }>();

const c = UseControl(props.controller);
ForwardEvents(c.Events, emit, ["show", "hide"]);
defineExpose({ controller: c });
</script>

<template>
	<span class="win-tooltip-host" @pointerenter="c.PointerEnter()" @pointerleave="c.PointerLeave()" @pointerdown="c.PointerDown()">
		<slot />
		<span v-if="c.Shown" role="tooltip" class="win-tooltip">{{ c.Text }}</span>
	</span>
</template>
