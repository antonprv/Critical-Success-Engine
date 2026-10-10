<!-- Created by Anton Piruev in 2026. Any direct commercial use of derivative work is strictly prohibited. -->
<script setup lang="ts">
import type { ToolbarController } from "../Controls/ToolbarController";
import { ForwardEvents, UseControl } from "../Core/UseControl";

const props = defineProps<{ controller: ToolbarController; }>();
const emit = defineEmits<{ click: [id: string]; toggle: [id: string, pressed: boolean]; }>();

const c = UseControl(props.controller);
ForwardEvents(c.Events, emit, ["click", "toggle"]);
defineExpose({ controller: c });
</script>

<template>
	<div role="toolbar" class="win-toolbar">
		<button
			v-for="button in c.Buttons"
			:key="button.Id"
			type="button"
			class="win-toolbar__button"
			:class="{ 'win-toolbar__button--pressed': button.Pressed }"
			:aria-pressed="button.Toggle ? Boolean(button.Pressed) : undefined"
			:disabled="button.Disabled || !c.Enabled"
			@click="c.Click(button.Id)"
		>
			{{ button.Label }}
		</button>
	</div>
</template>
