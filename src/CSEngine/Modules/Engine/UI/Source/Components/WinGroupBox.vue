<!-- Created by Anton Piruev in 2026. Any direct commercial use of derivative work is strictly prohibited. -->
<script setup lang="ts">
defineProps<{ title: string; }>();
</script>

<template>
	<fieldset class="win-groupbox">
		<legend class="win-groupbox__title">{{ title }}</legend>
		<slot />
	</fieldset>
</template>
