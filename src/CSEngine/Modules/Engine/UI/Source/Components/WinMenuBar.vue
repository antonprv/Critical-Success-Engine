<!-- Created by Anton Piruev in 2026. Any direct commercial use of derivative work is strictly prohibited. -->
<script setup lang="ts">
import { computed, onMounted, onUnmounted, ref } from "vue";
import type { MenuController, MenuItem } from "../Controls/MenuController";
import { ForwardEvents, UseControl } from "../Core/UseControl";

const props = defineProps<{ controller: MenuController; }>();
const emit = defineEmits<{ "open-change": [path: readonly string[]]; invoke: [item: MenuItem]; "check-change": [item: MenuItem, checked: boolean]; }>();

const c = UseControl(props.controller);
ForwardEvents(c.Events, emit, ["open-change", "invoke", "check-change"]);
defineExpose({ controller: c });

const root = ref<HTMLElement>();
const tops = ref<HTMLElement[]>([]);

/** "&File" -> "", "F", "ile": the mnemonic is drawn underlined. */
function LabelParts(label: string): { Before: string; Key: string; After: string; } {
	const index = label.indexOf("&");
	if (index < 0) return { Before: label, Key: "", After: "" };
	return { Before: label.slice(0, index), Key: label[index + 1]!, After: label.slice(index + 2) };
}

/** The open menus, from the drop-down of the menu bar item to the deepest submenu. */
const levels = computed(() => c.OpenPath.map((id) => c.Find(id)!.Items!));
const dropOffset = computed(() => tops.value[c.Items.findIndex((item) => item.Id === c.OpenPath[0])]!.offsetLeft);

function OnTopClick(id: string): void {
	if (c.OpenPath[0] === id) c.Close();
	else c.Open(id);
}

/** While a menu is open, pointing at another menu bar item opens that one instead (no click needed). */
function OnTopEnter(id: string): void {
	if (c.OpenPath.length > 0) c.Open(id);
}

const OnWindowPointerDown = (event: Event): void => {
	if (c.OpenPath.length > 0 && !root.value!.contains(event.target as Node)) c.Close();
};
onMounted(() => window.addEventListener("pointerdown", OnWindowPointerDown, true));
onUnmounted(() => window.removeEventListener("pointerdown", OnWindowPointerDown, true));
</script>

<template>
	<div ref="root" role="menubar" class="win-menubar" tabindex="0" @keydown="c.KeyDown($event.code, { Alt: $event.altKey })">
		<button
			v-for="item in c.Items"
			:key="item.Id"
			ref="tops"
			type="button"
			class="win-menubar__item"
			:class="{ 'win-menubar__item--open': c.OpenPath[0] === item.Id }"
			@click="OnTopClick(item.Id)"
			@pointerenter="OnTopEnter(item.Id)"
		>{{ LabelParts(item.Label).Before }}<u>{{ LabelParts(item.Label).Key }}</u>{{ LabelParts(item.Label).After }}</button>

		<Transition name="win-flyout">
		<div v-if="levels.length > 0" class="win-menu__levels" :style="{ marginLeft: `${dropOffset}px` }">
			<ul v-for="(items, level) in levels" :key="c.OpenPath[level]" role="menu" class="win-menu">
				<template v-for="item in items" :key="item.Id">
					<li v-if="item.Separator" role="separator" class="win-menu__separator" />
					<li
						v-else
						:role="item.Checkable ? 'menuitemcheckbox' : 'menuitem'"
						class="win-menu__item"
						:class="{
							'win-menu__item--highlighted': item.Id === c.HighlightedId,
							'win-menu__item--submenu': item.Items,
							'win-menu__item--disabled': item.Disabled,
						}"
						:aria-checked="item.Checkable ? Boolean(item.Checked) : undefined"
						:aria-disabled="item.Disabled ? 'true' : undefined"
						@click="c.Invoke(item.Id)"
					>
						<span class="win-menu__check">{{ item.Checked ? "✓" : "" }}</span>
						<span class="win-menu__label">{{ LabelParts(item.Label).Before }}<u>{{ LabelParts(item.Label).Key }}</u>{{ LabelParts(item.Label).After }}</span>
						<span class="win-menu__shortcut">{{ item.Shortcut ?? "" }}</span>
					</li>
				</template>
			</ul>
		</div>
		</Transition>
	</div>
</template>
