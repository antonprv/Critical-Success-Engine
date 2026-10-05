<!-- Created by Anton Piruev in 2026. Any direct commercial use of derivative work is strictly prohibited. -->
<script setup lang="ts">
import { computed } from "vue";
import { DefaultTailwindTheme, TailwindThemeClasses, WinKit, type TailwindTheme } from "../Core/Kits";
import { GetTheme, type WinTheme } from "../Core/Themes";
import { SkinClass, type Skin } from "../Skins/Skin";
import { UseSkinStyle } from "../Skins/UseSkinStyle";
import "../Styles/classic-kit.css";
import "../Styles/tailwind-kit.css";
import "../Styles/layout.css";
import "../Styles/motion.css";

/** `theme` picks the Windows look of the Classic kit; `tailwind` the look of the Tailwind kit. A skin goes on top of either. */
const props = withDefaults(defineProps<{ theme: WinTheme; kit?: WinKit; tailwind?: TailwindTheme; skin?: Skin | null; }>(), { kit: WinKit.Classic, tailwind: () => ({ ...DefaultTailwindTheme }), skin: null });

const kitClasses = computed(() => {
	if (props.kit === WinKit.Tailwind) return TailwindThemeClasses(props.tailwind);
	const info = GetTheme(props.theme);
	return ["win-kit--classic", `win-family--${info.Family}`, info.ClassName];
});
UseSkinStyle(() => props.skin);
</script>

<template>
	<div class="win-root" :class="[kitClasses, skin ? ['win-skin', SkinClass(skin)] : []]">
		<slot />
	</div>
</template>
