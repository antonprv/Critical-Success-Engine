<!-- Created by Anton Piruev in 2026. Any direct commercial use of derivative work is strictly prohibited. -->
<script setup lang="ts">
import { IsClickThrough } from "./Layout";
import { watchEffect } from "vue";
import { SkinClass } from "../Skins/Skin";
import { UseSkinStyle } from "../Skins/UseSkinStyle";
import type { UiDocument } from "./UiDocument";
import WinLayoutNode from "./WinLayoutNode.vue";

/**
 * Draws a UI document: live in a game or app (and in the designer's preview), or as the designer's canvas when `design`
 * is set (controls don't react, the selected widget is outlined with resize handles).
 */
/** `width` / `height`: the screen to lay the UI out on, in pixels; without them it fills its host. */
const props = withDefaults(defineProps<{ document: UiDocument; design?: boolean; selected?: string | null; width?: number | null; height?: number | null; }>(), { design: false, selected: null, width: null, height: null });

// The layout's skin styles this view only (not, say, the designer around it).
UseSkinStyle(() => props.document.Layout.Skin ?? null);
// Once on screen, the document's script gets OnShown.
watchEffect(() => props.document.NotifyShown(), { flush: "post" });
</script>

<template>
	<div
		class="win-layout"
		:class="[{ 'win-layout--design': design, 'win-layout--click-through': IsClickThrough(document.Layout) }, document.Layout.Skin ? ['win-skin', SkinClass(document.Layout.Skin)] : []]"
		:style="{ width: width === null ? '100%' : `${width}px`, height: height === null ? '100%' : `${height}px` }"
	>
		<WinLayoutNode :key="document.Id" :document="document" :node="document.Layout.Root" :design="design" :selected="selected" />
	</div>
</template>
