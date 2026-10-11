<!-- Created by Anton Piruev in 2026. Any direct commercial use of derivative work is strictly prohibited. -->
<script setup lang="ts">
import { TransitionGroup } from "vue";
import type { UiManager } from "./UiManager";
import WinDialogHost from "./WinDialogHost.vue";
import WinLayoutView from "./WinLayoutView.vue";

/** Where a game draws its UI: every document the UiManager shows, as layers over the game, and its dialogs on top. */
defineProps<{ manager: UiManager; }>();
</script>

<template>
	<div class="win-ui-host">
		<!-- Fragment (no tag): a layer is kept in place while it plays its leave animation (see motion.css). -->
		<TransitionGroup name="win-ui-layer" appear>
			<div v-for="entry in manager.Shown" :key="entry.Document.Id" class="win-ui-host__layer" :data-ui="entry.Id">
				<WinLayoutView :document="entry.Document" />
			</div>
		</TransitionGroup>
		<WinDialogHost :service="manager.Dialogs" />
	</div>
</template>
