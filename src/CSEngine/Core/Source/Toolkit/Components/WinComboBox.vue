<!-- Created by Anton Piruev in 2026. Any direct commercial use of derivative work is strictly prohibited. -->
<script setup lang="ts" generic="T">
import { onMounted, onUnmounted, ref } from "vue";
import type { ComboBoxController } from "../Controls/ComboBoxController";
import { ForwardEvents, UseControl } from "../Core/UseControl";

const props = defineProps<{ controller: ComboBoxController<T>; }>();
const emit = defineEmits<{ change: [index: number, value: T]; "open-change": [open: boolean]; }>();

const c = UseControl(props.controller);
ForwardEvents(c.Events, emit, ["change", "open-change"]);
defineExpose({ controller: c });

const root = ref<HTMLElement>();
const OnWindowPointerDown = (event: Event): void => {
	if (c.Open && !root.value!.contains(event.target as Node)) c.Close();
};
onMounted(() => window.addEventListener("pointerdown", OnWindowPointerDown, true));
onUnmounted(() => window.removeEventListener("pointerdown", OnWindowPointerDown, true));
</script>

<template>
	<div
		ref="root"
		role="combobox"
		class="win-combobox"
		tabindex="0"
		:aria-expanded="c.Open"
		:aria-disabled="c.Enabled ? undefined : 'true'"
		@click="c.Toggle()"
		@keydown="c.KeyDown($event.code, { Alt: $event.altKey })"
	>
		<span class="win-combobox__text">{{ c.SelectedOption?.Label ?? "" }}</span>
		<span class="win-combobox__arrow" />
		<Transition name="win-flyout">
		<ul v-if="c.Open" role="listbox" class="win-combobox__list">
			<li
				v-for="(option, index) in c.Options"
				:key="index"
				role="option"
				class="win-combobox__option"
				:aria-selected="index === c.HighlightedIndex ? 'true' : 'false'"
				@pointerenter="c.Highlight(index)"
				@click.stop="c.Choose(index)"
			>
				{{ option.Label }}
			</li>
		</ul>
		</Transition>
	</div>
</template>
