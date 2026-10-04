<!-- Created by Anton Piruev in 2026. Any direct commercial use of derivative work is strictly prohibited. -->
<script setup lang="ts">
import { inject } from "vue";
import { ResizeEdge, WindowController, WindowState } from "../Controls/WindowController";
import type { WindowManager } from "../Controls/WindowManager";
import type { CancelableEvent } from "../Core/EventHub";
import { UsePointerTracking } from "../Core/PointerTracking";
import { ForwardEvents, UseControl } from "../Core/UseControl";
import { DesktopAreaKey } from "./Keys";

const props = defineProps<{ controller: WindowController; manager?: WindowManager; }>();
const emit = defineEmits<{
	move: [x: number, y: number]; resize: [width: number, height: number]; "state-change": [state: WindowState];
	closing: [event: CancelableEvent]; close: []; activate: []; deactivate: [];
}>();

const c = UseControl(props.controller);
ForwardEvents(c.Events, emit, ["move", "resize", "state-change", "closing", "close", "activate", "deactivate"]);
defineExpose({ controller: c });

/** Outside a WinDesktop, windows maximize to the browser window. */
const Area = inject(DesktopAreaKey, () => ({ Width: window.innerWidth, Height: window.innerHeight }));
const track = UsePointerTracking();

const Edges: { Edge: ResizeEdge; Name: string; }[] = [
	{ Edge: ResizeEdge.Top, Name: "top" }, { Edge: ResizeEdge.Bottom, Name: "bottom" },
	{ Edge: ResizeEdge.Left, Name: "left" }, { Edge: ResizeEdge.Right, Name: "right" },
	{ Edge: ResizeEdge.TopLeft, Name: "top-left" }, { Edge: ResizeEdge.TopRight, Name: "top-right" },
	{ Edge: ResizeEdge.BottomLeft, Name: "bottom-left" }, { Edge: ResizeEdge.BottomRight, Name: "bottom-right" },
];

function OnTitlePointerDown(event: PointerEvent): void {
	if (event.button !== 0) return;
	event.preventDefault(); // no text selection while dragging the window
	c.BeginDrag(event.clientX, event.clientY);
	track((move) => c.DragTo(move.clientX, move.clientY), () => c.EndDrag());
}

function OnBorderPointerDown(event: PointerEvent, edge: ResizeEdge): void {
	if (event.button !== 0) return;
	event.preventDefault();
	c.BeginResize(edge, event.clientX, event.clientY);
	track((move) => c.ResizeTo(move.clientX, move.clientY), () => c.EndResize());
}

function OnTitleDoubleClick(): void {
	if (c.Maximizable) c.ToggleMaximize(Area());
}
</script>

<template>
	<section
		v-if="!c.Closed && c.State !== WindowState.Minimized"
		class="win-window"
		:class="{ 'win-window--inactive': !c.Active, 'win-window--maximized': c.State === WindowState.Maximized }"
		:style="{ left: `${c.X}px`, top: `${c.Y}px`, width: `${c.Width}px`, height: `${c.Height}px`, zIndex: manager ? manager.ZIndexOf(c) : undefined }"
		role="dialog"
		:aria-label="c.Title"
		@pointerdown="manager?.Activate(c)"
	>
		<header class="win-window__titlebar" @pointerdown="OnTitlePointerDown" @dblclick="OnTitleDoubleClick">
			<span class="win-window__title">{{ c.Title }}</span>
			<button v-if="c.Minimizable" type="button" class="win-window__button win-window__button--minimize" aria-label="Minimize" @pointerdown.stop @click="c.Minimize()" />
			<button
				v-if="c.Maximizable"
				type="button"
				class="win-window__button"
				:class="c.State === WindowState.Maximized ? 'win-window__button--restore' : 'win-window__button--maximize'"
				:aria-label="c.State === WindowState.Maximized ? 'Restore' : 'Maximize'"
				@pointerdown.stop
				@click="c.ToggleMaximize(Area())"
			/>
			<button v-if="c.Closable" type="button" class="win-window__button win-window__button--close" aria-label="Close" @pointerdown.stop @click="c.RequestClose()" />
		</header>
		<div class="win-window__body">
			<slot />
		</div>
		<template v-if="c.Resizable && c.State === WindowState.Normal">
			<div
				v-for="edge in Edges"
				:key="edge.Name"
				class="win-window__resize"
				:class="`win-window__resize--${edge.Name}`"
				@pointerdown.stop="OnBorderPointerDown($event, edge.Edge)"
			/>
		</template>
	</section>
</template>
