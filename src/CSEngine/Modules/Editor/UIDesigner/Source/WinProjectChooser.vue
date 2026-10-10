<!-- Created by Anton Piruev in 2026. Any direct commercial use of derivative work is strictly prohibited. -->
<script setup lang="ts">
import { onMounted, ref } from "vue";
import type { KnownProjects } from "./Project";

const props = defineProps<{ projects: KnownProjects; open: (file: string) => void; }>();

const rows = ref<Awaited<ReturnType<KnownProjects["List"]>>>([]);
const loaded = ref(false);
onMounted(async () => {
	rows.value = await props.projects.List();
	loaded.value = true;
});
</script>

<template>
	<div class="win-designer-chooser">
		<div class="win-window win-designer-chooser__window" role="dialog" aria-label="Which project is the UI for?">
			<div class="win-window__titlebar"><span class="win-window__title">UI Designer - which project is the UI for?</span></div>
			<div class="win-window__body win-designer-chooser__body">
				<button
					v-for="project in rows"
					:key="project.File"
					type="button"
					class="win-button win-designer__project-choice"
					:disabled="!project.Exists"
					@click="open(project.File)"
				>{{ project.Name }} ({{ project.Genre }}) - {{ project.File }}{{ project.Exists ? "" : " [missing]" }}</button>
				<p v-if="loaded && rows.length === 0">No projects yet: create one in the project browser.</p>
			</div>
		</div>
	</div>
</template>
