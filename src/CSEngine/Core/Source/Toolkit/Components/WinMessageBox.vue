<!-- Created by Anton Piruev in 2026. Any direct commercial use of derivative work is strictly prohibited. -->
<script setup lang="ts">
import { computed, onMounted, ref } from "vue";
import { MessageBoxButtons, MessageBoxController, MessageBoxIcon, MessageBoxResult } from "../Controls/MessageBoxController";
import { ForwardEvents, UseControl } from "../Core/UseControl";

const props = defineProps<{ controller: MessageBoxController; }>();
const emit = defineEmits<{ close: [result: MessageBoxResult]; }>();

const c = UseControl(props.controller);
ForwardEvents(c.Events, emit, ["close"]);
defineExpose({ controller: c });

const IconNames: Record<MessageBoxIcon, string> = {
	[MessageBoxIcon.None]: "",
	[MessageBoxIcon.Information]: "information",
	[MessageBoxIcon.Warning]: "warning",
	[MessageBoxIcon.Error]: "error",
	[MessageBoxIcon.Question]: "question",
};

/** The title bar's X works only where Escape does: boxes with Cancel, or with just OK. */
const canClose = computed(() => c.Results.includes(MessageBoxResult.Cancel) || c.Buttons === MessageBoxButtons.Ok);

const buttons = ref<HTMLButtonElement[]>([]);
onMounted(() => buttons.value[c.DefaultButton]!.focus());
</script>

<template>
	<div v-if="!c.Closed" class="win-messagebox">
		<section role="alertdialog" class="win-window win-messagebox__dialog" :aria-label="c.Title" tabindex="-1" @keydown="c.KeyDown($event.code)">
			<header class="win-window__titlebar">
				<span class="win-window__title">{{ c.Title }}</span>
				<button type="button" class="win-window__button win-window__button--close" aria-label="Close" :disabled="!canClose" @click="c.KeyDown('Escape')" />
			</header>
			<div class="win-messagebox__body">
				<div v-if="c.Icon !== MessageBoxIcon.None" class="win-messagebox__icon" :class="`win-messagebox__icon--${IconNames[c.Icon]}`" />
				<p class="win-messagebox__text">{{ c.Text }}</p>
			</div>
			<div class="win-messagebox__buttons">
				<button
					v-for="(result, index) in c.Results"
					:key="result"
					ref="buttons"
					type="button"
					class="win-button"
					:class="{ 'win-button--default': index === c.DefaultButton }"
					@click="c.Choose(result)"
				>
					{{ MessageBoxController.Label(result) }}
				</button>
			</div>
		</section>
	</div>
</template>
