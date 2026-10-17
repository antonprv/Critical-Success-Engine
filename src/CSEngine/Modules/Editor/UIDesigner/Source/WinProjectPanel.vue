<!-- Created by Anton Piruev in 2026. Any direct commercial use of derivative work is strictly prohibited. -->
<script setup lang="ts">
import { computed, ref } from "vue";
import { DefaultToolTheme, ThemeLabel, WinSelectList } from "@cse/ui";
import type { DesignerController } from "./DesignerController";
import type { ProjectSession } from "./Project";

const props = defineProps<{ session: ProjectSession; designer: DesignerController; }>();
const emit = defineEmits<{ message: [text: string]; "use-theme": []; }>();

/** The theme the game draws its documents in: the project's, or the engine's. */
const projectTheme = computed(() => (props.session.State.Theme ? ThemeLabel(props.session.State.Theme) : `the engine's (${ThemeLabel(DefaultToolTheme)})`));

const documents = computed(() => props.session.State.Documents.map((document) => ({ Id: document.Id, Label: document.Id })));
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
		<WinSelectList :items="documents" :current="session.State.Current" label="Documents" item-class="win-designer__document" current-class="win-designer__document--current" @select="Open" />
		<div class="win-designer__new-document">
			<input v-model="newId" class="win-textbox" placeholder="New document Id" aria-label="New document Id" @keydown.enter="Add">
			<button type="button" class="win-button win-designer__add-document" @click="Add">Add</button>
		</div>
		<div v-if="problem" class="win-designer__project-problem">{{ problem }}</div>
		<div class="win-designer__project-theme">Theme in the game: {{ projectTheme }}</div>
		<button type="button" class="win-button win-designer__use-theme" @click="emit('use-theme')">Use the designer's theme in the game</button>
	</fieldset>
</template>

<style scoped>
.win-designer__project { display: flex; flex-direction: column; gap: 4px; }
.win-designer__new-document { display: flex; gap: 4px; }
.win-designer__new-document input { flex: 1; min-width: 0; }
.win-designer__project-problem { color: #b00020; overflow-wrap: anywhere; }
</style>
