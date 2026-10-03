<!-- Created by Anton Piruev in 2026. Any direct commercial use of derivative work is strictly prohibited. -->
<script setup lang="ts">
import { provide, ref } from "vue";
import type { Area, WindowController } from "../Controls/WindowController";
import { WindowManager } from "../Controls/WindowManager";
import { UseControl } from "../Core/UseControl";
import { DesktopAreaKey } from "./Keys";

const props = defineProps<{ manager?: WindowManager; }>();

const m = UseControl(props.manager ?? new WindowManager());
const area = ref<HTMLElement>();

function Area(): Area {
	return { Width: area.value!.clientWidth, Height: area.value!.clientHeight };
}

provide(DesktopAreaKey, Area);
defineExpose({ manager: m, Area });

/** The taskbar's rule: clicking the active window's button minimizes it, any other button brings that window up. */
function OnTaskClick(window: WindowController): void {
	if (window === m.ActiveWindow) window.Minimize();
	else m.Activate(window);
}
</script>

<template>
	<div class="win-desktop">
		<div ref="area" class="win-desktop__area">
			<slot :manager="m" />
		</div>
		<div class="win-taskbar" role="toolbar" aria-label="Taskbar">
			<button
				v-for="(window, index) in m.TaskOrder"
				:key="index"
				type="button"
				class="win-taskbar__button"
				:class="{ 'win-taskbar__button--active': window === m.ActiveWindow }"
				@click="OnTaskClick(window)"
			>
				{{ window.Title }}
			</button>
		</div>
	</div>
</template>
