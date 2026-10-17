// Created by Anton Piruev in 2026.
// Any direct commercial use of derivative work is strictly prohibited.

import { markRaw } from "vue";
import { ControlBase } from "../Core/ControlBase";
import { CloneJson, type JsonValue } from "../Documents/Json";
import type { QuasarComponentRow } from "./QuasarTypes";

export type QuasarEvents = Record<string, unknown[]> & {
	/** The value changed (from the component, a script or the game): the new value. */
	change: [value: JsonValue];
};

/** What a component instance exposes to scripts: its methods (a table's firstPage, a dialog's show...). */
type Instance = Record<string, unknown>;

/** The props of the list a component shows, by component: what SetItems fills. */
const ItemProps: Record<string, string> = {
	QSelect: "options", QOptionGroup: "options", QBtnToggle: "options", QTable: "rows", QTree: "nodes", QVirtualScroll: "items", QChatMessage: "text",
};

/**
 * The live side of a Quasar widget: its props (the layout's, changed at run time by scripts and the game), its value
 * (v-model), the text of its default slot, and every event the component emits as an event of this controller - so
 * node graphs, scripts and the game's GameUi drive a Quasar widget the way they drive the toolkit's.
 */
export class QuasarController extends ControlBase<QuasarEvents> {
	/** The props given to the component (reactive once the document is built: UseControl). */
	public Props: Record<string, JsonValue>;
	/** The model-value; undefined while the layout gives none (the component's own default stands). */
	public Value: JsonValue | undefined;
	/** Text of the default slot while the widget holds no other widgets. */
	public Content: string;

	private _instance: Instance | null = null;

	public constructor(public readonly Row: QuasarComponentRow, props: Readonly<Record<string, JsonValue>>, content = "") {
		super({ Enabled: props["disable"] !== true });
		this.Props = CloneJson(props as Record<string, JsonValue>);
		this.Value = this.Props["model-value"];
		delete this.Props["model-value"];
		this.Content = content;
	}

	/** A check box's, toggle's or switch's state, for the variables that follow it; undefined for other values. */
	public get Checked(): boolean | undefined {
		return typeof this.Value === "boolean" ? this.Value : undefined;
	}

	/** The text the widget shows: its label prop when it has one, else the text of its default slot. */
	public get Label(): string {
		return typeof this.Props["label"] === "string" ? this.Props["label"] : this.Content;
	}

	public set Label(text: string) {
		if ("label" in this.Props) this.Props["label"] = text;
		else this.Content = text;
	}

	/** Changes the value; emits change (and Quasar's update:model-value) when it is a new one. */
	public SetValue(value: JsonValue): void {
		if (JSON.stringify(value) === JSON.stringify(this.Value)) return;
		this.Value = value;
		this.Emit("change", value);
		this.Emit("update:model-value", value);
	}

	public SetProp(key: string, value: JsonValue): void {
		this.Props[key] = value;
	}

	/** Fills the list the component shows (a select's options, a table's rows, a tree's nodes). */
	public SetItems(items: readonly JsonValue[]): void {
		const prop = ItemProps[this.Row.Name];
		if (!prop) throw new Error(`${this.Row.Name} has no list of items`);
		const rows = items.map((item) => (this.Row.Name === "QTable" && typeof item !== "object" ? { name: item } : this.Row.Name === "QTree" && typeof item !== "object" ? { label: item } : item));
		this.Props[prop] = rows as JsonValue[];
	}

	/** Called by the view: the component's events become this controller's. */
	public Raise(event: string, args: unknown[]): void {
		if (event === "update:model-value") {
			this.SetValue(args[0] as JsonValue);
			return;
		}
		(this.Events as unknown as { Emit(event: string, ...args: unknown[]): void; }).Emit(event, ...args);
	}

	/** Called by the view with the mounted component (null when it goes). */
	public Bind(instance: Instance | null): void {
		// The component is Vue's own object: kept as it is, not made reactive with the controller.
		this._instance = instance === null ? null : markRaw(instance);
	}

	/** Calls a method of the component (Quasar's API: a dialog's show, a table's lastPage...). */
	public Call(method: string, ...args: unknown[]): unknown {
		const fn = this._instance?.[method];
		if (typeof fn !== "function") throw new Error(`${this.Row.Name} has no method "${method}" (or isn't on screen yet)`);
		return (fn as (...a: unknown[]) => unknown)(...args);
	}

	protected override OnBlur(): void {
		this.CallIfAny("blur");
	}

	/** Focus goes to the component itself too. */
	public override Focus(): void {
		const was = this.Focused;
		super.Focus();
		if (!was && this.Focused) this.CallIfAny("focus");
	}

	private CallIfAny(method: string): void {
		const fn = this._instance?.[method];
		if (typeof fn === "function") (fn as () => void)();
	}
}
