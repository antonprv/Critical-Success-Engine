<!-- Created by Anton Piruev in 2026. Any direct commercial use of derivative work is strictly prohibited. -->
<script setup lang="ts">
import type { TreeNode, TreeViewController } from "../Controls/TreeViewController";
import { ForwardEvents, UseControl } from "../Core/UseControl";

const props = defineProps<{ controller: TreeViewController; }>();
const emit = defineEmits<{ "expand-change": [node: TreeNode, expanded: boolean]; "selection-change": [node: TreeNode]; activate: [node: TreeNode]; }>();

const c = UseControl(props.controller);
ForwardEvents(c.Events, emit, ["expand-change", "selection-change", "activate"]);
defineExpose({ controller: c });

const Indent = 16;
</script>

<template>
	<ul role="tree" class="win-tree" tabindex="0" @keydown="c.KeyDown($event.code)">
		<li
			v-for="visible in c.VisibleNodes"
			:key="visible.Node.Id"
			role="treeitem"
			class="win-tree__item"
			:class="{ 'win-tree__item--selected': visible.Node.Id === c.SelectedId }"
			:aria-expanded="visible.Node.Children ? c.IsExpanded(visible.Node.Id) : undefined"
			:aria-selected="visible.Node.Id === c.SelectedId ? 'true' : 'false'"
			:style="{ paddingLeft: `${visible.Depth * Indent + 3}px` }"
			@click="c.Select(visible.Node.Id)"
			@dblclick="c.DoubleClick(visible.Node.Id)"
		>
			<button
				v-if="visible.Node.Children"
				type="button"
				class="win-tree__expander"
				:aria-label="c.IsExpanded(visible.Node.Id) ? 'Collapse' : 'Expand'"
				@click.stop="c.Toggle(visible.Node.Id)"
			/>
			<span class="win-tree__label">{{ visible.Node.Label }}</span>
		</li>
	</ul>
</template>
