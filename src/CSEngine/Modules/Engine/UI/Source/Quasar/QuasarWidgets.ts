// Created by Anton Piruev in 2026.
// Any direct commercial use of derivative work is strictly prohibited.

import { UseControl } from "../Core/UseControl";
import type { JsonValue } from "../Documents/Json";
import type { PropDefinition, PropKind, WidgetDefinition } from "../Documents/Widgets";
import { QuasarController } from "./QuasarController";
import { QuasarComponentTable } from "./QuasarTable.generated";
import type { QuasarComponentRow } from "./QuasarTypes";
import { QuasarView } from "./QuasarView";

/** The palette group of Quasar's widgets: "Quasar: Forms". */
export const QuasarGroupPrefix = "Quasar: ";

/** Quasar's palette groups in the order the palette shows them (Quasar's documentation's order). */
export const QuasarGroups: readonly string[] = ["Layout", "Containers", "Buttons", "Forms", "Pickers", "Navigation", "Data", "Popups", "Feedback", "Spinners", "Media", "Behaviour"];

/** Where a palette group goes: the toolkit's own (and custom widgets') first, then Quasar's in their order. */
export function PaletteOrder(group: string): number {
	return group.startsWith(QuasarGroupPrefix) ? 1 + QuasarGroups.indexOf(group.slice(QuasarGroupPrefix.length)) : 0;
}

/** "BtnDropdown" -> "Btn dropdown". */
const Spaced = (name: string): string => name.replace(/(?<=[a-z0-9])([A-Z])/g, (letter) => ` ${letter.toLowerCase()}`);

/** The kind a starter value is edited as (the designer's catalog knows every other prop). */
function KindOfValue(value: JsonValue): PropKind {
	const kind = typeof value === "boolean" ? "boolean" : typeof value === "number" ? "number" : typeof value === "string" ? "text" : "json";
	return kind as PropKind;
}

/** The props a widget is created with: its starters. Any other Quasar prop may be added (the definition is open). */
function StarterProps(row: QuasarComponentRow): PropDefinition[] {
	return Object.entries(row.Starter).map(([key, value]) => ({ Key: key, Label: key, Kind: KindOfValue(value), Default: value }));
}

/** The widget type of one Quasar component. */
export function QuasarWidget(row: QuasarComponentRow): WidgetDefinition {
	const events = row.Events.filter((event) => event !== "update:model-value");
	return {
		Type: row.Type,
		Label: Spaced(row.Name.slice(1)),
		Group: QuasarGroupPrefix + row.Group,
		Container: row.Slots.length > 0,
		Size: [...row.Size],
		Props: StarterProps(row),
		Events: row.Model ? [...events, "change"] : events,
		OpenProps: true,
		Slots: [...row.Slots],
		...(row.Children ? { Children: row.Children } : {}),
		CreateController: (node) => UseControl(new QuasarController(row, node.Props, node.Content ?? row.Text ?? "")),
		Component: QuasarView,
	};
}

/** Every Quasar component as a widget type. */
export function QuasarWidgets(): WidgetDefinition[] {
	return QuasarComponentTable.map(QuasarWidget);
}
