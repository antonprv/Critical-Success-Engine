<!-- Created by Anton Piruev in 2026. Any direct commercial use of derivative work is strictly prohibited. -->
<script setup lang="ts">
import WinMessageBox from "../Components/WinMessageBox.vue";
import type { DialogService } from "./Dialogs";
import WinLayoutView from "./WinLayoutView.vue";

/** Shows the modals of a DialogService, newest on top, each blocking everything under it. */
defineProps<{ service: DialogService; }>();
</script>

<template>
	<div class="win-dialog-host">
		<div v-for="dialog in service.Open" :key="dialog.Id" class="win-dialog-host__modal">
			<WinLayoutView v-if="dialog.Document" :document="dialog.Document" />
			<WinMessageBox v-else :controller="dialog.MessageBox!" />
		</div>
	</div>
</template>
