<!-- Created by Anton Piruev in 2026. Any direct commercial use of derivative work is strictly prohibited. -->
<script setup lang="ts">
import { computed } from "vue";
import { GetTheme, type WinTheme } from "../Core/Themes";
import "../Styles/toolkit.css";

const props = defineProps<{ theme: WinTheme }>();
const info = computed(() => GetTheme(props.theme));
</script>

<template>
	<div class="win-root" :class="[`win-family--${info.Family}`, info.ClassName]">
		<slot />
	</div>
</template>
