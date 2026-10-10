<!-- Created by Anton Piruev in 2026. Any direct commercial use of derivative work is strictly prohibited. -->
<script setup lang="ts">
import { ref } from "vue";
import type { DesignerController } from "./DesignerController";
import type { ProjectSession } from "./Project";

const props = defineProps<{ session: ProjectSession; designer: DesignerController; }>();
const emit = defineEmits<{ message: [text: string]; }>();

const newId = ref("");
const problem = ref("");

async function Open(id: string): Promise<void> {
	emit("message", (await props.session.OpenDocument(id, props.designer)) ?? `Opened ${id}`);
}

async function Add(): Promise<void> {
	const result = await props.session.NewDocument(newId.value.trim(), props.designer);
	const saved = result.startsWith("Saved ");
	problem.value = saved ? "" : result;
	if (saved) newId.value = "";
	emit("message", result);
}
</script>

<template>
	<fieldset class="win-groupbox win-designer__project">
		<legend class="win-groupbox__title">Project: {{ session.State.Name }}</legend>
		<button
			v-for="document in session.State.Documents"
			:key="document.Id"
			type="button"
			class="win-button win-designer__document"
			:class="{ 'win-designer__document--current': document.Id === session.State.Current }"
			@click="Open(document.Id)"
		>{{ document.Id }}</button>
		<div class="win-designer__new-document">
			<input v-model="newId" class="win-textbox" placeholder="New document Id" aria-label="New document Id" @keydown.enter="Add">
			<button type="button" class="win-button win-designer__add-document" @click="Add">Add</button>
		</div>
		<div v-if="problem" class="win-designer__project-problem">{{ problem }}</div>
	</fieldset>
</template>

<style scoped>
.win-designer__project { display: flex; flex-direction: column; gap: 4px; }
.win-designer__document { width: 100%; text-align: left; }
/* The open document: bold and pressed in, as a selected tool. */
.win-designer__document--current { font-weight: bold; box-shadow: inset 1px 1px var(--dark, #404040), inset -1px -1px var(--hilight, #fff); }
.win-designer__new-document { display: flex; gap: 4px; }
.win-designer__new-document input { flex: 1; min-width: 0; }
.win-designer__project-problem { color: #b00020; overflow-wrap: anywhere; }
</style>
