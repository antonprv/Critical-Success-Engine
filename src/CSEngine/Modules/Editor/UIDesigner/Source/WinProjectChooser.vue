<!-- Created by Anton Piruev in 2026. Any direct commercial use of derivative work is strictly prohibited. -->
<script setup lang="ts">
import { computed, onMounted, ref } from "vue";
import { WinSelectList } from "@cse/ui";
import type { KnownProjects } from "./Project";

const props = defineProps<{ projects: KnownProjects; open: (file: string) => void; }>();

const rows = ref<Awaited<ReturnType<KnownProjects["List"]>>>([]);
const loaded = ref(false);
const items = computed(() => rows.value.map((project) => ({ Id: project.File, Label: `${project.Name} (${project.Genre}) - ${project.File}${project.Exists ? "" : " [missing]"}`, Disabled: !project.Exists })));
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
				<WinSelectList :items="items" label="Projects" item-class="win-designer__project-choice" @select="open" />
				<p v-if="loaded && rows.length === 0">No projects yet: create one in the project browser.</p>
			</div>
		</div>
	</div>
</template>
