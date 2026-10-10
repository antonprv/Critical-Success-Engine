<!-- Created by Anton Piruev in 2026. Any direct commercial use of derivative work is strictly prohibited. -->
<script setup lang="ts">
export interface SelectListItem {
	Id: string;
	Label: string;
	Disabled?: boolean;
}

/**
 * A plain list of choices where one item is the active one (documents of a project, projects to open...). A click makes
 * an item active; the arrow keys move the choice. It acts like a pointer-driven control, never as selectable text.
 * `itemClass` / `currentClass` add the caller's own classes to every item / to the active one.
 */
const props = defineProps<{ items: SelectListItem[]; current?: string | null; label?: string; itemClass?: string; currentClass?: string; }>();
const emit = defineEmits<{ select: [id: string]; }>();

function OnKeyDown(event: KeyboardEvent): void {
	const step = event.code === "ArrowDown" ? 1 : event.code === "ArrowUp" ? -1 : 0;
	if (step === 0) return;
	event.preventDefault();
	const enabled = props.items.filter((item) => !item.Disabled);
	const index = enabled.findIndex((item) => item.Id === props.current);
	const next = enabled[Math.min(Math.max(index + step, 0), enabled.length - 1)];
	if (next) emit("select", next.Id);
}
</script>

<template>
	<div class="win-selectlist" role="listbox" :aria-label="label" @keydown="OnKeyDown">
		<button
			v-for="item in items"
			:key="item.Id"
			type="button"
			role="option"
			class="win-selectlist__item"
			:class="[itemClass, item.Id === current ? ['win-selectlist__item--current', currentClass] : null]"
			:aria-selected="item.Id === current"
			:disabled="item.Disabled"
			@click="emit('select', item.Id)"
		>{{ item.Label }}</button>
	</div>
</template>
