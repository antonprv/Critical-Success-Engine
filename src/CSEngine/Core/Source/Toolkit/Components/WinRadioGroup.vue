<!-- Created by Anton Piruev in 2026. Any direct commercial use of derivative work is strictly prohibited. -->
<script setup lang="ts" generic="T">
import type { RadioGroupController } from "../Controls/RadioGroupController";
import { ForwardEvents, UseControl } from "../Core/UseControl";

const props = defineProps<{ controller: RadioGroupController<T>; }>();
const emit = defineEmits<{ change: [value: T, previous: T | null]; }>();

const c = UseControl(props.controller);
ForwardEvents(c.Events, emit, ["change"]);
defineExpose({ controller: c });
</script>

<template>
	<div role="radiogroup" class="win-radiogroup" @keydown="c.KeyDown($event.code)">
		<label
			v-for="option in c.Options"
			:key="String(option.Value)"
			class="win-radio"
			:class="{ 'win-radio--disabled': option.Disabled }"
		>
			<span
				role="radio"
				class="win-radio__dot"
				:aria-checked="option.Value === c.Value ? 'true' : 'false'"
				:aria-disabled="option.Disabled ? 'true' : undefined"
				:tabindex="option.Value === c.Value ? 0 : -1"
				@click="c.Select(option.Value)"
			/>
			<span class="win-radio__label">{{ option.Label }}</span>
		</label>
	</div>
</template>
