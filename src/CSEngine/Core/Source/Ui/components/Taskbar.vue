<!-- Created by Anton Piruev in 2026. Any direct commercial use of derivative work is strictly prohibited. -->
<script setup lang="ts">
import { onUnmounted, ref } from "vue";

defineProps<{ title: string }>();

const FormatTime = (date: Date): string =>
	`${String(date.getHours()).padStart(2, "0")}:${String(date.getMinutes()).padStart(2, "0")}`;

const time = ref(FormatTime(new Date()));
const timer = setInterval(() => (time.value = FormatTime(new Date())), 1000);
onUnmounted(() => clearInterval(timer));
</script>

<template>
	<footer class="taskbar">
		<div class="task-button" :title="title">{{ title }}</div>

		<div class="tray">
			<!-- Ambience, not a player: the engine's jungle pulse at drum & bass tempo. -->
			<div class="equalizer" aria-hidden="true">
				<span v-for="bar in 5" :key="bar" class="equalizer__bar" />
			</div>
			<span class="tempo">174 BPM</span>
			<time class="clock">{{ time }}</time>
		</div>
	</footer>
</template>

<style scoped>
.taskbar {
	display: flex;
	align-items: center;
	height: 30px;
	padding: 0 0 0 6px;
	background: linear-gradient(180deg,
		#3168d5 0%, #4993e6 4%, #2157d7 12%, #2663e0 50%, #245edb 88%, #1941a5 100%);
	border-top: 1px solid #0c2e8a;
	font: 11px var(--xp-font);
	color: #fff;
	user-select: none;
}

/* The menu's own window, shown pressed - the active task. */
.task-button {
	max-width: 180px;
	padding: 4px 10px;
	border-radius: 3px;
	background: linear-gradient(180deg, #1e52b7 0%, #1d4fb3 100%);
	box-shadow: inset 1px 1px 2px rgba(0, 0, 0, 0.55), inset -1px -1px 0 rgba(255, 255, 255, 0.12);
	white-space: nowrap;
	overflow: hidden;
	text-overflow: ellipsis;
}

.tray {
	display: flex;
	align-items: center;
	gap: 8px;
	height: 100%;
	margin-left: auto;
	padding: 0 12px 0 10px;
	background: linear-gradient(180deg, #0c59b9 0%, #18a3f3 6%, #1290e8 50%, #0d8cdb 88%, #0b67c5 100%);
	border-left: 1px solid #092e5c;
	box-shadow: inset 1px 0 0 rgba(255, 255, 255, 0.25);
}

.equalizer {
	display: flex;
	align-items: flex-end;
	gap: 2px;
	height: 14px;
}

.equalizer__bar {
	width: 3px;
	height: 100%;
	/* A media player's level meter of the time: green LEDs, going yellow at the peak. */
	background: linear-gradient(180deg, #e8ff7a 0%, var(--xp-led) 30%, #1a9a1a 100%);
	transform-origin: bottom;
	will-change: transform;
	/* Stepped like an LED level meter of the era - and the screen only changes on a step, not every frame. */
	animation: break 0.345s steps(4, end) infinite alternate; /* one beat at 174 BPM */
}

/* Off-beat timing per bar - the shuffle of a chopped break rather than a metronome. */
.equalizer__bar:nth-child(2) { animation-duration: 0.23s; animation-delay: -0.1s; }
.equalizer__bar:nth-child(3) { animation-duration: 0.172s; animation-delay: -0.05s; }
.equalizer__bar:nth-child(4) { animation-duration: 0.29s; animation-delay: -0.2s; }
.equalizer__bar:nth-child(5) { animation-duration: 0.4s; animation-delay: -0.15s; }

@keyframes break {
	from { transform: scaleY(0.2); }
	to { transform: scaleY(1); }
}

.tempo {
	color: #e8f4ff;
}

.clock {
	min-width: 34px;
	text-align: right;
}

@media (prefers-reduced-motion: reduce) {
	.equalizer__bar {
		animation: none;
		transform: scaleY(0.6);
	}
}

@media (max-width: 480px) {
	.tempo {
		display: none;
	}
}
</style>
