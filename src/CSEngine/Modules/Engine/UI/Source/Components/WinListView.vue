<!-- Created by Anton Piruev in 2026. Any direct commercial use of derivative work is strictly prohibited. -->
<script setup lang="ts" generic="T">
import { ListViewController, SortDirection } from "../Controls/ListViewController";
import { ForwardEvents, UseControl } from "../Core/UseControl";

export interface ListColumn<Item> {
	Key: string;
	Label: string;
	/** How the column sorts; by default by its text, numbers in natural order. */
	Compare?: (a: Item, b: Item) => number;
}

const props = defineProps<{ controller: ListViewController<T>; columns: ListColumn<T>[]; }>();
const emit = defineEmits<{ "selection-change": [indices: number[]]; activate: [index: number, item: T]; sort: [column: string, direction: SortDirection]; }>();

const c = UseControl(props.controller);
ForwardEvents(c.Events, emit, ["selection-change", "activate", "sort"]);
defineExpose({ controller: c });

const Cell = (item: T, key: string): string => String((item as Record<string, unknown>)[key]);
const Mods = (event: MouseEvent | KeyboardEvent) => ({ Ctrl: event.ctrlKey, Shift: event.shiftKey });

function Sort(column: ListColumn<T>): void {
	c.SortBy(column.Key, column.Compare ?? ((a, b) => Cell(a, column.Key).localeCompare(Cell(b, column.Key), undefined, { numeric: true })));
}

function AriaSort(column: ListColumn<T>): "none" | "ascending" | "descending" {
	if (c.SortColumn !== column.Key) return "none";
	return c.SortDirection === SortDirection.Ascending ? "ascending" : "descending";
}
</script>

<template>
	<div role="grid" class="win-listview" tabindex="0" @keydown="c.KeyDown($event.code, Mods($event))">
		<div role="row" class="win-listview__header">
			<button
				v-for="column in columns"
				:key="column.Key"
				type="button"
				role="columnheader"
				class="win-listview__column"
				:aria-sort="AriaSort(column)"
				@click="Sort(column)"
			>
				{{ column.Label }}
			</button>
		</div>
		<div
			v-for="(item, index) in c.Items"
			:key="index"
			role="row"
			class="win-listview__row"
			:class="{ 'win-listview__row--selected': c.SelectedIndices.has(index), 'win-listview__row--focused': index === c.FocusedIndex }"
			:aria-selected="c.SelectedIndices.has(index) ? 'true' : 'false'"
			@click="c.Click(index, Mods($event))"
			@dblclick="c.DoubleClick(index)"
		>
			<span v-for="column in columns" :key="column.Key" role="gridcell" class="win-listview__cell">{{ Cell(item, column.Key) }}</span>
		</div>
	</div>
</template>
