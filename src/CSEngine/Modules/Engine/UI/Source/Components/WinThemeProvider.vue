<!-- Created by Anton Piruev in 2026. Any direct commercial use of derivative work is strictly prohibited. -->
<script setup lang="ts">
import { computed, onBeforeUnmount, provide, reactive, watchEffect } from "vue";
import { HidePortalTheme, KitContextKey, ShowPortalTheme, type KitContext } from "../Core/KitContext";
import { DefaultQuasarTheme, DefaultTailwindTheme, QuasarThemeClasses, TailwindThemeClasses, WinKit, type TailwindTheme } from "../Core/Kits";
import { GetTheme, type WinTheme } from "../Core/Themes";
import { SkinClass, type Skin } from "../Skins/Skin";
import { UseSkinStyle } from "../Skins/UseSkinStyle";
import "../Styles/classic-kit.css";
import "../Styles/tailwind-kit.css";
import "../Styles/quasar-kit.css";
import "../Styles/layout.css";
import "../Styles/motion.css";
import "../Styles/solution-tree.css";

/**
 * `theme` picks the Windows look of the Classic kit; `tailwind` the palette of the Tailwind and Quasar kits (the Quasar
 * kit's default when none is given is Quasar's own blue). A skin goes on top of any. `portals`: Quasar's pop-ups (at the
 * end of <body>) take this look too - the default; a provider nested in another for a preview says false.
 */
const props = withDefaults(defineProps<{ theme: WinTheme; kit?: WinKit; tailwind?: TailwindTheme | null; skin?: Skin | null; portals?: boolean; }>(), { kit: WinKit.Classic, tailwind: null, skin: null, portals: true });

const palette = computed(() => props.tailwind ?? (props.kit === WinKit.Quasar ? { ...DefaultQuasarTheme } : { ...DefaultTailwindTheme }));
const kitClasses = computed(() => {
	if (props.kit === WinKit.Tailwind) return TailwindThemeClasses(palette.value);
	if (props.kit === WinKit.Quasar) return QuasarThemeClasses(palette.value);
	const info = GetTheme(props.theme);
	return ["win-kit--classic", `win-family--${info.Family}`, info.ClassName];
});

const context: KitContext = reactive({
	Kit: computed(() => props.kit),
	Dark: computed(() => props.kit !== WinKit.Classic && palette.value.Dark),
}) as unknown as KitContext;
provide(KitContextKey, context);

const owner = {};
watchEffect(() => {
	if (props.portals) ShowPortalTheme(owner, kitClasses.value, context.Dark);
	else HidePortalTheme(owner);
});
onBeforeUnmount(() => HidePortalTheme(owner));
UseSkinStyle(() => props.skin);
</script>

<template>
	<div class="win-root" :class="[kitClasses, skin ? ['win-skin', SkinClass(skin)] : []]">
		<slot />
	</div>
</template>
