<!-- Created by Anton Piruev in 2026. Any direct commercial use of derivative work is strictly prohibited. -->
<script setup lang="ts">
import { computed, onBeforeUnmount, onMounted, ref, watch } from "vue";
import type { CodeSession } from "./CodeSession";
import { MonacoView } from "./MonacoView";

const props = defineProps<{ session: CodeSession; dark?: boolean; }>();
const emit = defineEmits<{ message: [text: string]; }>();

const host = ref<HTMLElement>();
let view: MonacoView | null = null;

onMounted(async () => {
	// Monaco is big: it loads when the code tab first shows.
	const { monaco } = await import("./MonacoSetup");
	view = new MonacoView(monaco, host.value!, props.session, props.dark);
});
onBeforeUnmount(() => view?.Dispose());
watch(() => props.dark, (dark) => view?.SetDark(dark));

async function Open(path: string): Promise<void> {
	const problem = await props.session.Open(path);
	if (problem) emit("message", problem);
}

function Close(path: string): void {
	const tab = props.session.Tab(path)!;
	// Nothing changed is lost without asking.
	const confirmed = !tab.Changed || window.confirm(`${path} has changes that aren't saved. Close it anyway?`);
	if (confirmed) props.session.Close(path, true);
}

const Name = (path: string): string => path.slice(path.lastIndexOf("/") + 1);

/** The files as a tree: each folder (under Source) once, as a heading, before its files. */
const rows = computed(() => {
	const shown = new Set<string>();
	const list: { Kind: "folder" | "file"; Path: string; Name: string; Depth: number; }[] = [];
	for (const path of props.session.State.Files) {
		const parts = path.split("/");
		for (let depth = 1; depth < parts.length - 1; depth++) {
			const folder = parts.slice(0, depth + 1).join("/");
			if (shown.has(folder)) continue;
			shown.add(folder);
			list.push({ Kind: "folder", Path: folder, Name: parts[depth]!, Depth: depth - 1 });
		}
		list.push({ Kind: "file", Path: path, Name: parts.at(-1)!, Depth: parts.length - 2 });
	}
	return list;
});
</script>

<template>
	<div class="win-code">
		<nav class="win-code__files" aria-label="Code files">
			<template v-for="row in rows" :key="row.Path">
				<div v-if="row.Kind === 'folder'" class="win-code__folder" :style="{ paddingLeft: `${4 + row.Depth * 10}px` }">{{ row.Name }}/</div>
				<button
					v-else
					type="button"
					class="win-code__file"
					:class="{ 'win-code__file--active': row.Path === session.State.Active }"
					:title="row.Path"
					:style="{ paddingLeft: `${4 + row.Depth * 10}px` }"
					@click="Open(row.Path)"
				>{{ row.Name }}</button>
			</template>
		</nav>
		<div class="win-code__main">
			<div class="win-code__tabs" role="tablist">
				<div
					v-for="tab in session.State.Tabs"
					:key="tab.Path"
					class="win-code__tab"
					:class="{ 'win-code__tab--active': tab.Path === session.State.Active, 'win-code__tab--changed': tab.Changed }"
					role="tab"
					:aria-selected="tab.Path === session.State.Active"
					:title="tab.Path"
				>
					<button type="button" class="win-code__tab-name" @click="session.Activate(tab.Path)">{{ Name(tab.Path) }}<span v-if="tab.Changed" class="win-code__changed" aria-label="changed"> ●</span></button>
					<button type="button" class="win-code__tab-close" :aria-label="`Close ${Name(tab.Path)}`" @click="Close(tab.Path)">×</button>
				</div>
			</div>
			<div v-show="session.State.Active" ref="host" class="win-code__editor" />
			<div v-if="!session.State.Active" class="win-code__empty">Pick a file on the left. Ctrl+S saves it.</div>
		</div>
	</div>
</template>

<style scoped>
.win-code { display: flex; height: 100%; min-height: 0; }
.win-code__files { display: flex; flex-direction: column; width: 160px; min-width: 120px; flex-shrink: 0; overflow: auto; border-right: 1px solid var(--d-line, #ccc); background: var(--d-panel); }
.win-code__folder { padding: 2px 4px; opacity: .7; white-space: nowrap; }
.win-code__file { text-align: left; border: 0; background: transparent; color: inherit; padding: 2px 4px; font: inherit; cursor: pointer; white-space: nowrap; overflow: hidden; text-overflow: ellipsis; }
.win-code__file:hover { background: color-mix(in srgb, var(--select, #316ac5) 15%, transparent); }
.win-code__file--active { background: var(--select, #316ac5); color: var(--select-text, #fff); }
.win-code__main { display: flex; flex: 1; flex-direction: column; min-width: 0; }
.win-code__tabs { display: flex; gap: 2px; overflow-x: auto; border-bottom: 1px solid var(--d-line, #ccc); }
.win-code__tab { display: flex; align-items: center; border: 1px solid var(--d-line, #ccc); border-bottom: 0; background: var(--d-panel); }
.win-code__tab--active { background: var(--d-canvas, #fff); font-weight: bold; }
.win-code__tab-name, .win-code__tab-close { border: 0; background: transparent; color: inherit; font: inherit; padding: 2px 6px; cursor: pointer; }
.win-code__changed { color: var(--select, #316ac5); }
.win-code__editor { flex: 1; min-height: 0; }
.win-code__empty { padding: 16px; opacity: .7; }
</style>
