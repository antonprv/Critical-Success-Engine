<!-- Created by Anton Piruev in 2026. Any direct commercial use of derivative work is strictly prohibited. -->
<script setup lang="ts">
import { nextTick, onMounted, ref, watch } from "vue";
import { SolutionIcon, type Modifiers, type SolutionTreeController, type VisibleSolutionNode } from "../Controls/SolutionTreeController";
import { ForwardEvents, UseControl } from "../Core/UseControl";

const props = defineProps<{ controller: SolutionTreeController; }>();
const emit = defineEmits<{
	"expand-change": [id: string, expanded: boolean]; "selection-change": [ids: string[]]; activate: [id: string]; rename: [id: string, name: string];
	delete: [ids: string[]]; copy: [ids: string[]]; cut: [ids: string[]]; paste: [targetId: string]; move: [ids: string[], targetId: string];
	"drop-copy": [ids: string[], targetId: string]; undo: []; redo: []; "context-menu": [id: string | null, x: number, y: number];
}>();

const c = UseControl(props.controller);
ForwardEvents(c.Events, emit, ["expand-change", "selection-change", "activate", "rename", "delete", "copy", "cut", "paste", "move", "drop-copy", "undo", "redo", "context-menu"]);
defineExpose({ controller: c });

const Indent = 16;
const view = ref<HTMLElement | null>(null);
const box = ref<HTMLInputElement[]>([]);

const Mods = (event: MouseEvent | KeyboardEvent): Modifiers => ({ Ctrl: event.ctrlKey || event.metaKey, Shift: event.shiftKey });

function Measure(): void {
	const element = view.value!;
	c.Scroll(element.scrollTop, element.clientHeight);
}

onMounted(Measure);

// The controller scrolls (keys, Reveal): the view follows.
watch(() => c.ScrollTop, (top) => {
	if (view.value!.scrollTop !== top) view.value!.scrollTop = top;
});

// The rename box takes the focus, its text selected up to the extension (as Explorer does).
watch(() => c.Renaming, async (id) => {
	if (id === null) return view.value!.focus();
	await nextTick();
	const input = box.value[0];
	if (!input) return;
	input.focus();
	const dot = c.Draft.indexOf(".", 1);
	input.setSelectionRange(0, dot < 0 || c.Find(id)!.Kind !== "File" ? c.Draft.length : dot);
});

function OnKeyDown(event: KeyboardEvent): void {
	if (c.KeyDown(event.code, Mods(event))) event.preventDefault();
}

function OnRowClick(event: MouseEvent, row: VisibleSolutionNode): void {
	c.Select(row.Node.Id, Mods(event));
}

function OnContextMenu(event: MouseEvent, id: string | null): void {
	event.preventDefault();
	c.ContextMenu(id, event.clientX, event.clientY);
}

function OnDragStart(event: DragEvent, id: string): void {
	c.BeginDrag(id);
	event.dataTransfer?.setData("text/plain", c.Dragging.join("\n"));
}

function OnDragOver(event: DragEvent, id: string): void {
	if (!c.DragOver(id)) return;
	event.preventDefault();
	if (event.dataTransfer) event.dataTransfer.dropEffect = event.ctrlKey ? "copy" : "move";
}

function OnDrop(event: DragEvent): void {
	event.preventDefault();
	c.Drop(event.ctrlKey);
}

function RowClass(row: VisibleSolutionNode): Record<string, boolean> {
	const node = row.Node;
	return {
		"win-tree__item--selected": c.IsSelected(node.Id),
		"win-solution__row--focused": node.Id === c.FocusId,
		"win-solution__row--drop": node.Id === c.DropTarget,
		"win-solution__row--hidden": node.Hidden === true,
		"win-solution__row--missing": node.Missing === true,
		"win-solution__row--nested": node.Nested === true,
		"win-solution__row--modified": node.Modified === true,
		"win-solution__row--error": node.Error === true,
	};
}
</script>

<template>
	<div
		ref="view"
		role="tree"
		aria-multiselectable="true"
		class="win-tree win-solution"
		:class="{ 'win-solution--disabled': !c.Enabled }"
		tabindex="0"
		@keydown="OnKeyDown"
		@scroll="Measure"
		@contextmenu.self="OnContextMenu($event, null)"
	>
		<div class="win-solution__space" :style="{ height: `${c.Window.Total * c.RowHeight}px` }" @contextmenu.self="OnContextMenu($event, null)">
			<div class="win-solution__rows" :style="{ transform: `translateY(${c.Window.Start * c.RowHeight}px)` }">
				<div
					v-for="row in c.Window.Rows"
					:key="row.Node.Id"
					role="treeitem"
					class="win-tree__item win-solution__row"
					:class="RowClass(row)"
					:data-id="row.Node.Id"
					:aria-level="row.Depth + 1"
					:aria-expanded="row.Expandable ? c.IsExpanded(row.Node.Id) : undefined"
					:aria-selected="c.IsSelected(row.Node.Id) ? 'true' : 'false'"
					:draggable="c.Enabled && c.Renaming !== row.Node.Id"
					:style="{ height: `${c.RowHeight}px`, paddingLeft: `${row.Depth * Indent + 3}px` }"
					@click="OnRowClick($event, row)"
					@dblclick="c.DoubleClick(row.Node.Id)"
					@contextmenu="OnContextMenu($event, row.Node.Id)"
					@dragstart="OnDragStart($event, row.Node.Id)"
					@dragover="OnDragOver($event, row.Node.Id)"
					@dragleave="c.DragOver(null)"
					@drop="OnDrop"
					@dragend="c.EndDrag()"
				>
					<button
						v-if="row.Expandable"
						type="button"
						class="win-tree__expander"
						tabindex="-1"
						:aria-label="c.IsExpanded(row.Node.Id) ? 'Collapse' : 'Expand'"
						@click.stop="c.Toggle(row.Node.Id)"
						@dblclick.stop
					/>
					<span class="win-tree__label win-solution__label">
						<span class="win-solution__icon" :class="`win-solution__icon--${SolutionIcon(row.Node)}`" aria-hidden="true" />
						<input
							v-if="c.Renaming === row.Node.Id"
							ref="box"
							v-model="c.Draft"
							class="win-solution__rename"
							spellcheck="false"
							@click.stop
							@dblclick.stop
							@keydown.stop="OnKeyDown"
							@blur="c.CommitRename()"
						>
						<span v-else class="win-solution__name">{{ row.Node.Label }}</span>
					</span>
				</div>
			</div>
		</div>
	</div>
</template>

