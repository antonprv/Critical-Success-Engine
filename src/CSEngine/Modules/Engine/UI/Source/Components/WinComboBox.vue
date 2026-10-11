<!-- Created by Anton Piruev in 2026. Any direct commercial use of derivative work is strictly prohibited. -->
<script setup lang="ts" generic="T">
import { computed, nextTick, onMounted, onUnmounted, ref, shallowRef, watch, type CSSProperties } from "vue";
import type { ComboBoxController } from "../Controls/ComboBoxController";
import { PlacePopup, PopupZIndex, type PopupPlacement } from "../Core/PopupPlacement";
import { ForwardEvents, UseControl } from "../Core/UseControl";

/** `embedded`: the list stays inside the window and is clipped by it; off, it floats above everything and can leave the window (WinForms). */
const props = withDefaults(defineProps<{ controller: ComboBoxController<T>; embedded?: boolean; }>(), { embedded: true });
const emit = defineEmits<{ change: [index: number, value: T]; "open-change": [open: boolean]; }>();

const c = UseControl(props.controller);
ForwardEvents(c.Events, emit, ["change", "open-change"]);
defineExpose({ controller: c });

const root = ref<HTMLElement>();
const list = ref<HTMLElement>();
const floating = computed(() => !props.embedded);

//#region closing on outside clicks
const OnWindowPointerDown = (event: Event): void => {
	const target = event.target as Node;
	if (c.Open && !root.value!.contains(target) && !list.value?.contains(target)) c.Close();
};
onMounted(() => window.addEventListener("pointerdown", OnWindowPointerDown, true));
onUnmounted(() => window.removeEventListener("pointerdown", OnWindowPointerDown, true));
//#endregion

//#region floating list
/** The floating list lives in a host of its own at the end of the theme root, so the kit and skin classes still reach it. */
const host = shallowRef<HTMLElement | null>(null);
const placement = ref<PopupPlacement | null>(null);
let measuredHeight = 0;

const SkinClassesAround = (element: Element): string => [...(element.closest(".win-layout")?.classList ?? [])].filter((name) => name.startsWith("win-skin")).join(" ");

function EnsureHost(): void {
	if (!host.value) {
		host.value = document.createElement("div");
		host.value.style.display = "contents";
	}
	host.value.className = `win-popup-host ${SkinClassesAround(root.value!)}`;
	const themeRoot = root.value!.closest(".win-root") ?? document.body;
	if (host.value.parentElement !== themeRoot) themeRoot.appendChild(host.value);
}

function RemoveHost(): void {
	host.value?.remove();
	host.value = null;
}

function Place(): void {
	const box = root.value!.getBoundingClientRect();
	placement.value = PlacePopup({ Left: box.left, Top: box.top, Bottom: box.bottom, Width: box.width }, measuredHeight, { Width: window.innerWidth, Height: window.innerHeight });
}

const OnScroll = (event: Event): void => {
	if (!list.value?.contains(event.target as Node)) Place();
};

function TrackAnchor(on: boolean): void {
	if (on) {
		window.addEventListener("resize", Place);
		window.addEventListener("scroll", OnScroll, true);
	} else {
		window.removeEventListener("resize", Place);
		window.removeEventListener("scroll", OnScroll, true);
	}
}

watch(() => c.Open, async (open) => {
	if (!open) {
		TrackAnchor(false);
		return;
	}
	if (!floating.value) return;
	EnsureHost();
	measuredHeight = 0;
	Place();
	await nextTick();
	if (!c.Open || !list.value) return;
	measuredHeight = list.value.offsetHeight;
	Place();
	TrackAnchor(true);
}, { flush: "sync" });

watch(floating, (on) => {
	c.Close();
	if (on) EnsureHost();
	else RemoveHost();
});
onMounted(() => { if (floating.value) EnsureHost(); });
onUnmounted(() => {
	TrackAnchor(false);
	RemoveHost();
});

/** Inline, so it wins over the kits' own `position: absolute; left: 0; right: 0` for the list. */
const floatingStyle = computed<CSSProperties | undefined>(() => {
	const at = placement.value;
	if (!floating.value || !at) return undefined;
	return { position: "fixed", left: `${at.Left}px`, top: `${at.Top}px`, right: "auto", margin: "0", minWidth: `${at.MinWidth}px`, maxHeight: `${at.MaxHeight}px`, overflowY: "auto", zIndex: PopupZIndex, pointerEvents: "auto" };
});
//#endregion
</script>

<template>
	<div
		ref="root"
		role="combobox"
		class="win-combobox"
		tabindex="0"
		:aria-expanded="c.Open"
		:aria-disabled="c.Enabled ? undefined : 'true'"
		@click="c.Toggle()"
		@keydown="c.KeyDown($event.code, { Alt: $event.altKey })"
	>
		<span class="win-combobox__text">{{ c.SelectedOption?.Label ?? "" }}</span>
		<span class="win-combobox__arrow" />
		<Teleport :to="host ?? 'body'" :disabled="!floating">
		<Transition name="win-flyout">
		<ul v-if="c.Open" ref="list" role="listbox" class="win-combobox__list" :class="{ 'win-combobox__list--floating': floating }" :style="floatingStyle" @mousedown.prevent>
			<li
				v-for="(option, index) in c.Options"
				:key="index"
				role="option"
				class="win-combobox__option"
				:aria-selected="index === c.HighlightedIndex ? 'true' : 'false'"
				:aria-disabled="option.Disabled ? 'true' : undefined"
				@pointerenter="c.Highlight(index)"
				@click.stop="c.Choose(index)"
			>
				{{ option.Label }}
			</li>
		</ul>
		</Transition>
		</Teleport>
	</div>
</template>
