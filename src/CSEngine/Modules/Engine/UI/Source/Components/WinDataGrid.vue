<!-- Created by Anton Piruev in 2026. Any direct commercial use of derivative work is strictly prohibited. -->
<script setup lang="ts">
import { computed, nextTick, onMounted, ref, watch } from "vue";
import { NewRowId, SortOrder, type DataGridController, type DataGridRow } from "../Controls/DataGridController";
import { ForwardEvents, UseControl } from "../Core/UseControl";

const props = defineProps<{ controller: DataGridController; }>();
const emit = defineEmits<{
	"selection-change": [ids: string[]]; "cell-edit": [id: string, key: string, value: string]; "row-add": [key: string, value: string];
	"delete-rows": [ids: string[]]; copy: [text: string, ids: string[]]; paste: [text: string, id: string, key: string]; activate: [id: string];
	"sort-change": [key: string | null, order: SortOrder]; undo: []; redo: [];
}>();

const c = UseControl(props.controller);
ForwardEvents(c.Events, emit, ["selection-change", "cell-edit", "row-add", "delete-rows", "copy", "paste", "activate", "sort-change", "undo", "redo"]);
defineExpose({ controller: c });

const DefaultWidth = 200;
const view = ref<HTMLElement | null>(null);
const box = ref<(HTMLInputElement | HTMLTextAreaElement)[]>([]);
const template = computed(() => c.Columns.map((column) => `${column.Width ?? DefaultWidth}px`).join(" ") + " 1fr");

const Mods = (event: MouseEvent | KeyboardEvent) => ({ Ctrl: event.ctrlKey || event.metaKey, Shift: event.shiftKey });

function Measure(): void {
	c.Scroll(view.value!.scrollTop, view.value!.clientHeight);
}

onMounted(Measure);

watch(() => c.ScrollTop, (top) => {
	if (view.value!.scrollTop !== top) view.value!.scrollTop = top;
});

// The edit box takes the focus; when the edit ends the grid has it again.
watch(() => c.Editing, async (editing) => {
	if (editing === null) return view.value!.focus();
	await nextTick();
	const input = box.value[0];
	if (!input) return;
	input.focus();
	input.setSelectionRange(c.Draft.length, c.Draft.length);
});

function OnKeyDown(event: KeyboardEvent): void {
	// Ctrl+V is the paste event's (it carries the clipboard's text).
	if ((event.ctrlKey || event.metaKey) && event.code === "KeyV") return;
	if (c.KeyDown(event.code, Mods(event), event.key)) event.preventDefault();
}

function OnPaste(event: ClipboardEvent): void {
	if (c.Editing !== null) return;
	event.preventDefault();
	c.Paste(event.clipboardData?.getData("text/plain") ?? "");
}

function OnCopy(event: ClipboardEvent): void {
	if (c.Editing !== null || c.Selected.length === 0) return;
	event.preventDefault();
	event.clipboardData?.setData("text/plain", c.CopyText());
}

function AriaSort(key: string): "none" | "ascending" | "descending" {
	return c.SortKey === key ? c.SortOrder : SortOrder.None;
}

const IsFocused = (row: DataGridRow, key: string): boolean => c.FocusCell?.Id === row.Id && c.FocusCell.Key === key;
const IsEditing = (row: DataGridRow, key: string): boolean => c.Editing?.Id === row.Id && c.Editing.Key === key;
</script>

<template>
	<div
		ref="view"
		role="grid"
		class="win-listview win-datagrid"
		:class="{ 'win-datagrid--disabled': !c.Enabled }"
		tabindex="0"
		:aria-rowcount="c.Window.Total"
		@keydown="OnKeyDown"
		@scroll="Measure"
		@paste="OnPaste"
		@copy="OnCopy"
	>
		<div role="row" class="win-listview__header win-datagrid__header" :style="{ gridTemplateColumns: template }">
			<button
				v-for="column in c.Columns"
				:key="column.Key"
				type="button"
				role="columnheader"
				class="win-listview__column win-datagrid__column"
				:aria-sort="AriaSort(column.Key)"
				@click="c.SortBy(column.Key)"
			>
				{{ column.Label }}
			</button>
		</div>
		<div class="win-datagrid__space" :style="{ height: `${c.Window.Total * c.RowHeight}px` }">
			<div class="win-datagrid__rows" :style="{ transform: `translateY(${c.Window.Start * c.RowHeight}px)` }">
				<div
					v-for="row in c.Window.Rows"
					:key="row.Id"
					role="row"
					class="win-listview__row win-datagrid__row"
					:class="{
						'win-listview__row--selected': c.IsSelected(row.Id), 'win-datagrid__row--new': row.Id === NewRowId,
						'win-datagrid__row--error': row.Error === true, 'win-datagrid__row--warning': row.Warning === true, 'win-datagrid__row--modified': row.Modified === true,
					}"
					:data-id="row.Id"
					:aria-selected="c.IsSelected(row.Id) ? 'true' : 'false'"
					:style="{ height: `${c.RowHeight}px`, gridTemplateColumns: template }"
				>
					<div
						v-for="column in c.Columns"
						:key="column.Key"
						role="gridcell"
						class="win-listview__cell win-datagrid__cell"
						:class="{ 'win-datagrid__cell--focused': IsFocused(row, column.Key), 'win-datagrid__cell--editable': column.Editable === true }"
						:data-key="column.Key"
						@click="c.Select(row.Id, Mods($event), column.Key)"
						@dblclick="c.DoubleClick(row.Id, column.Key)"
					>
						<template v-if="IsEditing(row, column.Key)">
							<textarea
								v-if="column.Multiline"
								ref="box"
								v-model="c.Draft"
								class="win-datagrid__editor"
								spellcheck="false"
								@click.stop
								@dblclick.stop
								@keydown.stop="OnKeyDown"
								@blur="c.CommitEdit()"
							/>
							<input
								v-else
								ref="box"
								v-model="c.Draft"
								class="win-datagrid__editor"
								spellcheck="false"
								@click.stop
								@dblclick.stop
								@keydown.stop="OnKeyDown"
								@blur="c.CommitEdit()"
							>
						</template>
						<span v-else class="win-datagrid__text">{{ row.Cells[column.Key] ?? "" }}</span>
					</div>
				</div>
			</div>
		</div>
	</div>
</template>
