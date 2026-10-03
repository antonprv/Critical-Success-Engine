<!-- Created by Anton Piruev in 2026. Any direct commercial use of derivative work is strictly prohibited. -->
<script setup lang="ts">
import type { TabSelectingEvent, TabsController } from "../Controls/TabsController";
import { ForwardEvents, UseControl } from "../Core/UseControl";

const props = defineProps<{ controller: TabsController; }>();
const emit = defineEmits<{ selecting: [event: TabSelectingEvent]; change: [id: string, previous: string | null]; }>();

const c = UseControl(props.controller);
ForwardEvents(c.Events, emit, ["selecting", "change"]);
defineExpose({ controller: c });
</script>

<template>
	<div class="win-tabs">
		<div role="tablist" class="win-tabs__strip" @keydown="c.KeyDown($event.code, { Ctrl: $event.ctrlKey, Shift: $event.shiftKey })">
			<button
				v-for="tab in c.Tabs"
				:key="tab.Id"
				type="button"
				role="tab"
				class="win-tab"
				:class="{ 'win-tab--selected': tab.Id === c.SelectedId }"
				:aria-selected="tab.Id === c.SelectedId ? 'true' : 'false'"
				:aria-disabled="tab.Disabled ? 'true' : undefined"
				:tabindex="tab.Id === c.SelectedId ? 0 : -1"
				@click="c.Select(tab.Id)"
			>
				{{ tab.Label }}
			</button>
		</div>
		<div role="tabpanel" class="win-tabs__page">
			<slot :name="String(c.SelectedId)" />
		</div>
	</div>
</template>
