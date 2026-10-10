<!-- Created by Anton Piruev in 2026. Any direct commercial use of derivative work is strictly prohibited. -->
<script setup lang="ts">
import type { UiManager } from "./UiManager";
import WinDialogHost from "./WinDialogHost.vue";
import WinLayoutView from "./WinLayoutView.vue";

/** Where a game draws its UI: every document the UiManager shows, as layers over the game, and its dialogs on top. */
defineProps<{ manager: UiManager; }>();
</script>

<template>
	<div class="win-ui-host">
		<div v-for="entry in manager.Shown" :key="entry.Document.Id" class="win-ui-host__layer" :data-ui="entry.Id">
			<WinLayoutView :document="entry.Document" />
		</div>
		<WinDialogHost :service="manager.Dialogs" />
	</div>
</template>
