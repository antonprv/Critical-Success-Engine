<!-- Created by Anton Piruev in 2026. Any direct commercial use of derivative work is strictly prohibited. -->
<script setup lang="ts">
import { computed, ref } from "vue";
import { UsePointerTracking } from "@cse/ui";
import { DialogResult, DialogResults } from "@cse/ui";
import type { DesignerController } from "./DesignerController";
import { ActionInfos, ActionTypes, CheckCondition, GraphNodeKind, type ActionType, type GraphNode, type GraphParam } from "@cse/ui";
import { WidgetType, type WidgetRegistry } from "@cse/ui";
/** The node scripting canvas: events and actions as cards, linked output to input. */
const props = defineProps<{ designer: DesignerController; widgets: WidgetRegistry; }>();

const NodeWidth = 220;
const PortY = 14;
const track = UsePointerTracking();
const canvas = ref<HTMLElement>();

const graph = computed(() => props.designer.Layout.Graph ?? { Nodes: [], Links: [] });

/** Widgets with behaviour (a controller): only they have events and can be acted on. */
const live = computed(() => props.designer.Hierarchy.map((h) => h.Node).filter((n) => props.widgets.Get(n.Type)!.CreateController));
const TypeOf = (name: GraphParam | undefined) => live.value.find((n) => n.Name === name)?.Type;
const EventsOf = (name: GraphParam | undefined): string[] => {
	const type = TypeOf(name);
	return type ? [...props.widgets.Get(type)!.Events, "enter", "leave"] : ["click"];
};

function Title(node: GraphNode): string {
	return node.Kind === GraphNodeKind.Event ? `When ${node.Params["Widget"]} ${node.Type}` : ActionInfos[node.Type as ActionType].Label;
}

//#region adding

const Offset = (): number => 24 + graph.value.Nodes.length * 24;

function AddEvent(): void {
	const selected = live.value.find((n) => n.Name === props.designer.SelectedName) ?? live.value[0];
	const widget = selected?.Name ?? "";
	props.designer.AddGraphNode(GraphNodeKind.Event, EventsOf(widget)[0]!, Offset(), Offset(), { Widget: widget });
}

function AddAction(event: Event): void {
	const select = event.target as HTMLSelectElement;
	const type = select.value as ActionType;
	select.value = "";
	const firstWidget = live.value[0]?.Name ?? "";
	const firstCheck = live.value.find((n) => n.Type === WidgetType.CheckBox)?.Name ?? firstWidget;
	const params: Record<string, GraphParam> = {};
	for (const param of ActionInfos[type].Params) {
		params[param.Key] = { widget: param.Key === "Check" ? firstCheck : firstWidget, text: "", boolean: false, result: DialogResult.OK }[param.Kind];
	}
	props.designer.AddGraphNode(GraphNodeKind.Action, type, Offset() + 260, Offset(), params);
}

//#endregion

//#region editing params

const Value = (event: Event): string => (event.target as HTMLInputElement).value;

function OnEventWidget(node: GraphNode, event: Event): void {
	const widget = Value(event);
	props.designer.SetGraphParam(node.Id, "Widget", widget);
	if (!EventsOf(widget).includes(node.Type)) props.designer.SetGraphNodeType(node.Id, EventsOf(widget)[0]!);
	if (TypeOf(widget) !== WidgetType.CheckBox) props.designer.SetGraphParam(node.Id, "When", undefined);
}

const HasCondition = (node: GraphNode): boolean => TypeOf(node.Params["Widget"]) === WidgetType.CheckBox && node.Type === "change";
const Results = DialogResults.filter((r) => r !== DialogResult.None);

//#endregion

//#region dragging nodes and links

const pending = ref<{ From: string; X: number; Y: number; } | null>(null);

const OutPort = (node: GraphNode) => ({ X: node.X + NodeWidth, Y: node.Y + PortY });
const InPort = (node: GraphNode) => ({ X: node.X, Y: node.Y + PortY });
const Curve = (a: { X: number; Y: number; }, b: { X: number; Y: number; }) => `M ${a.X} ${a.Y} C ${a.X + 60} ${a.Y}, ${b.X - 60} ${b.Y}, ${b.X} ${b.Y}`;

const links = computed(() => graph.value.Links.map((link) => {
	const from = OutPort(graph.value.Nodes.find((n) => n.Id === link.From)!);
	const to = InPort(graph.value.Nodes.find((n) => n.Id === link.To)!);
	return { Link: link, Path: Curve(from, to), Middle: { X: (from.X + to.X) / 2, Y: (from.Y + to.Y) / 2 } };
}));

function Local(event: MouseEvent): { X: number; Y: number; } {
	const rect = canvas.value!.getBoundingClientRect();
	return { X: event.clientX - rect.left + canvas.value!.scrollLeft, Y: event.clientY - rect.top + canvas.value!.scrollTop };
}

/** From an output port: a link follows the pointer until it is released on an input port. */
function OnPortOut(node: GraphNode, event: PointerEvent): void {
	if (event.button !== 0) return;
	event.preventDefault();
	pending.value = { From: node.Id, ...Local(event) };
	track((move) => { pending.value = { From: node.Id, ...Local(move) }; }, () => { pending.value = null; });
}

function OnPortIn(node: GraphNode): void {
	if (pending.value) props.designer.Connect(pending.value.From, node.Id);
}

function OnHeaderPointerDown(node: GraphNode, event: PointerEvent): void {
	if (event.button !== 0) return;
	event.preventDefault();
	const start = { X: node.X, Y: node.Y, PointerX: event.clientX, PointerY: event.clientY };
	props.designer.BeginGesture();
	track((move) => props.designer.MoveGraphNode(node.Id, start.X + move.clientX - start.PointerX, start.Y + move.clientY - start.PointerY), () => props.designer.EndGesture());
}

//#endregion
</script>

<template>
	<div class="win-nodes">
		<div class="win-nodes__toolbar">
			<button type="button" class="win-button" data-add="event" @click="AddEvent">+ Event</button>
			<select class="win-textbox" data-add="action" value="" @change="AddAction">
				<option value="">+ Action...</option>
				<option v-for="type in ActionTypes" :key="type" :value="type">{{ ActionInfos[type].Label }}</option>
			</select>
		</div>
		<div ref="canvas" class="win-nodes__canvas">
			<svg class="win-nodes__links">
				<path v-for="link in links" :key="`${link.Link.From}>${link.Link.To}`" :d="link.Path" />
				<path v-if="pending" class="win-nodes__pending" :d="Curve(OutPort(graph.Nodes.find((n) => n.Id === pending!.From)!), pending)" />
			</svg>
			<button
				v-for="link in links"
				:key="`x${link.Link.From}>${link.Link.To}`"
				type="button"
				class="win-nodes__unlink"
				:style="{ left: `${link.Middle.X}px`, top: `${link.Middle.Y}px` }"
				aria-label="Remove link"
				@click="designer.Disconnect(link.Link.From, link.Link.To)"
			>×</button>

			<div
				v-for="node in graph.Nodes"
				:key="node.Id"
				class="win-nodes__node"
				:class="`win-nodes__node--${node.Kind}`"
				:data-node="node.Id"
				:style="{ left: `${node.X}px`, top: `${node.Y}px`, width: `${NodeWidth}px` }"
			>
				<header class="win-nodes__header" @pointerdown="OnHeaderPointerDown(node, $event)">
					<span class="win-nodes__title">{{ Title(node) }}</span>
					<button type="button" class="win-nodes__delete" aria-label="Delete node" @pointerdown.stop @click="designer.DeleteGraphNode(node.Id)">×</button>
				</header>
				<span v-if="node.Kind === GraphNodeKind.Action" class="win-nodes__port win-nodes__port--in" @pointerup="OnPortIn(node)" />
				<span class="win-nodes__port win-nodes__port--out" @pointerdown="OnPortOut(node, $event)" />

				<div class="win-nodes__body">
					<template v-if="node.Kind === GraphNodeKind.Event">
						<label>Widget
							<select class="win-textbox" data-param="Widget" :value="node.Params['Widget']" @change="OnEventWidget(node, $event)">
								<option v-for="widget in live" :key="widget.Name" :value="widget.Name">{{ widget.Name }}</option>
							</select>
						</label>
						<label>Event
							<select class="win-textbox" data-param="Event" :value="node.Type" @change="designer.SetGraphNodeType(node.Id, Value($event))">
								<option v-for="name in EventsOf(node.Params['Widget'])" :key="name" :value="name">{{ name }}</option>
							</select>
						</label>
						<label v-if="HasCondition(node)">When
							<select class="win-textbox" data-param="When" :value="node.Params['When'] ?? CheckCondition.Always" @change="designer.SetGraphParam(node.Id, 'When', Value($event))">
								<option :value="CheckCondition.Always">always</option>
								<option :value="CheckCondition.Checked">checked</option>
								<option :value="CheckCondition.Unchecked">unchecked</option>
							</select>
						</label>
					</template>
					<template v-else>
						<label v-for="param in ActionInfos[node.Type as ActionType].Params" :key="param.Key">{{ param.Label }}
							<select v-if="param.Kind === 'widget'" class="win-textbox" :data-param="param.Key" :value="node.Params[param.Key]" @change="designer.SetGraphParam(node.Id, param.Key, Value($event))">
								<option v-for="widget in live" :key="widget.Name" :value="widget.Name">{{ widget.Name }}</option>
							</select>
							<select v-else-if="param.Kind === 'result'" class="win-textbox" :data-param="param.Key" :value="node.Params[param.Key]" @change="designer.SetGraphParam(node.Id, param.Key, Value($event))">
								<option v-for="result in Results" :key="result" :value="result">{{ result }}</option>
							</select>
							<input v-else-if="param.Kind === 'boolean'" type="checkbox" :data-param="param.Key" :checked="node.Params[param.Key] === true" @change="designer.SetGraphParam(node.Id, param.Key, ($event.target as HTMLInputElement).checked)">
							<input v-else class="win-textbox" :data-param="param.Key" :value="node.Params[param.Key]" @input="designer.SetGraphParam(node.Id, param.Key, Value($event))">
						</label>
					</template>
				</div>
			</div>
		</div>
	</div>
</template>

<style scoped>
.win-nodes { display: flex; flex-direction: column; height: 100%; min-height: 0; }
.win-nodes__toolbar { display: flex; gap: 8px; padding: 6px; border-bottom: 1px solid var(--d-line); }
.win-nodes__toolbar .win-textbox { width: auto; }
.win-nodes__canvas {
	position: relative;
	flex: 1;
	overflow: auto;
	background-image: radial-gradient(color-mix(in srgb, var(--d-ink) 14%, transparent) 1px, transparent 1.5px);
	background-size: 16px 16px;
	user-select: none;
}
.win-nodes__links { position: absolute; left: 0; top: 0; width: 4000px; height: 4000px; overflow: visible; pointer-events: none; }
.win-nodes__links path { fill: none; stroke: var(--kit-primary, var(--accent, #316ac5)); stroke-width: 2; }
.win-nodes__links .win-nodes__pending { stroke-dasharray: 6 4; opacity: 0.7; }
.win-nodes__unlink { position: absolute; z-index: 2; width: 18px; height: 18px; margin: -9px 0 0 -9px; padding: 0; border: 1px solid var(--d-line); border-radius: 50%; background: var(--d-panel); color: var(--d-muted); font-size: 12px; line-height: 15px; cursor: pointer; opacity: 0; transition: opacity 0.15s; }
.win-nodes__canvas:hover .win-nodes__unlink { opacity: 1; }
.win-nodes__node { position: absolute; z-index: 1; border: 1px solid var(--d-line); border-radius: 8px; background: var(--d-panel); color: var(--d-ink); box-shadow: 0 4px 14px rgba(0, 0, 0, 0.18); animation: win-flyout-in var(--win-normal, 0.17s) var(--win-ease-out, ease-out); }
.win-nodes__header { display: flex; align-items: center; gap: 6px; height: 28px; padding: 0 8px; border-radius: 8px 8px 0 0; color: #fff; font-weight: 600; font-size: 12px; cursor: move; }
.win-nodes__node--event .win-nodes__header { background: linear-gradient(90deg, #c2410c, #ea580c); }
.win-nodes__node--action .win-nodes__header { background: linear-gradient(90deg, #1d4ed8, #4f46e5); }
.win-nodes__title { flex: 1; overflow: hidden; white-space: nowrap; text-overflow: ellipsis; }
.win-nodes__delete { padding: 0 4px; border: 0; background: transparent; color: inherit; font-size: 15px; cursor: pointer; opacity: 0.8; }
.win-nodes__port { position: absolute; top: 8px; width: 12px; height: 12px; border: 2px solid #fff; border-radius: 50%; background: var(--kit-primary, var(--accent, #316ac5)); cursor: crosshair; box-shadow: 0 0 0 1px rgba(0, 0, 0, 0.3); }
.win-nodes__port--in { left: -7px; }
.win-nodes__port--out { right: -7px; }
.win-nodes__body { display: flex; flex-direction: column; gap: 4px; padding: 8px; }
.win-nodes__body label { display: grid; grid-template-columns: 64px 1fr; align-items: center; gap: 4px; font-size: 12px; }
.win-nodes__body .win-textbox { min-width: 0; width: 100%; }
</style>
