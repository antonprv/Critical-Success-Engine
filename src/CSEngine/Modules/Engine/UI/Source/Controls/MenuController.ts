// Created by Anton Piruev in 2026.
// Any direct commercial use of derivative work is strictly prohibited.

import { ControlBase, type ControlOptions } from "../Core/ControlBase";

export interface MenuItem {
	Id: string;
	/** `&` marks the mnemonic: "&File" is opened with Alt+F and drawn with an underlined F. */
	Label: string;
	Shortcut?: string;
	Disabled?: boolean;
	Separator?: boolean;
	Checkable?: boolean;
	Checked?: boolean;
	Items?: MenuItem[];
}

export interface MenuOptions extends ControlOptions {
	Items: MenuItem[];
}

export type MenuEvents = {
	"open-change": [path: readonly string[]];
	invoke: [item: MenuItem];
	"check-change": [item: MenuItem, checked: boolean];
};

/** A menu bar with its drop-down menus and submenus, driven by mouse or keyboard like a Win32 menu. */
export class MenuController extends ControlBase<MenuEvents> {
	public readonly Items: MenuItem[];

	private _openPath: string[] = [];
	private _highlighted: string | null = null;

	public constructor(options: MenuOptions) {
		super(options);
		this.Items = options.Items;
	}

	/** Ids of the open menus, from the menu bar item down to the deepest open submenu. */
	public get OpenPath(): readonly string[] { return this._openPath; }
	/** The highlighted item in the deepest open menu. */
	public get HighlightedId(): string | null { return this._highlighted; }

	public static Mnemonic(label: string): string | null {
		const index = label.indexOf("&");
		return index >= 0 && index + 1 < label.length ? label[index + 1]!.toLowerCase() : null;
	}

	public static StripMnemonic(label: string): string {
		return label.replace("&", "");
	}

	public Find(id: string, items: MenuItem[] = this.Items): MenuItem | undefined {
		for (const item of items) {
			if (item.Id === id) return item;
			const found = item.Items ? this.Find(id, item.Items) : undefined;
			if (found) return found;
		}
		return undefined;
	}

	/** Opens a menu bar item's drop-down. */
	public Open(id: string): void {
		const top = this.Items.find((item) => item.Id === id);
		if (!top?.Items || top.Disabled) return;
		this._openPath = [id];
		this._highlighted = null;
		this.Emit("open-change", this._openPath);
	}

	public Close(): void {
		if (this._openPath.length === 0) return;
		this._openPath = [];
		this._highlighted = null;
		this.Emit("open-change", this._openPath);
	}

	/** Chooses an item: toggles it if checkable, reports it, closes the menu. Submenu items open instead. */
	public Invoke(id: string): void {
		const item = this.Find(id);
		if (!item || item.Disabled || item.Separator) return;
		if (item.Items) {
			this.OpenSubmenu(item);
			return;
		}
		if (item.Checkable) {
			item.Checked = !item.Checked;
			this.Emit("check-change", item, item.Checked);
		}
		this.Emit("invoke", item);
		this.Close();
	}

	public KeyDown(code: string, modifiers: { Alt?: boolean; } = {}): void {
		if (!this.Enabled) return;
		const letter = code.startsWith("Key") ? code.slice(3).toLowerCase() : null;

		if (this._openPath.length === 0) {
			if (modifiers.Alt && letter) {
				const top = this.Items.find((item) => MenuController.Mnemonic(item.Label) === letter);
				if (top) this.Open(top.Id);
			}
			return;
		}

		switch (code) {
			case "ArrowDown": this.MoveHighlight(1); return;
			case "ArrowUp": this.MoveHighlight(-1); return;
			case "ArrowRight": this.Right(); return;
			case "ArrowLeft": this.Left(); return;
			case "Escape": this.Back(); return;
			case "Enter": if (this._highlighted) this.Invoke(this._highlighted); return;
		}

		const match = letter ? this.CurrentItems().find((item) => this.Selectable(item) && MenuController.Mnemonic(item.Label) === letter) : undefined;
		if (match) this.Invoke(match.Id);
	}

	private CurrentItems(): MenuItem[] {
		return this.Find(this._openPath.at(-1)!)!.Items!;
	}

	private Selectable(item: MenuItem): boolean {
		return !item.Separator && !item.Disabled;
	}

	private MoveHighlight(direction: 1 | -1): void {
		const items = this.CurrentItems().filter((item) => this.Selectable(item));
		const index = items.findIndex((item) => item.Id === this._highlighted);
		const next = index < 0 ? (direction === 1 ? 0 : items.length - 1) : (index + direction + items.length) % items.length;
		this._highlighted = items[next]!.Id;
	}

	private OpenSubmenu(item: MenuItem): void {
		this._openPath = [...this._openPath, item.Id];
		this._highlighted = item.Items!.find((child) => this.Selectable(child))?.Id ?? null;
		this.Emit("open-change", this._openPath);
	}

	private Right(): void {
		const highlighted = this._highlighted ? this.Find(this._highlighted) : undefined;
		if (highlighted?.Items) this.OpenSubmenu(highlighted);
		else this.SwitchTopMenu(1);
	}

	private Left(): void {
		if (this._openPath.length > 1) this.Back();
		else this.SwitchTopMenu(-1);
	}

	/** Escape: closes the deepest submenu (highlighting the item it came from), or the whole menu. */
	private Back(): void {
		if (this._openPath.length > 1) {
			this._highlighted = this._openPath.at(-1)!;
			this._openPath = this._openPath.slice(0, -1);
			this.Emit("open-change", this._openPath);
		} else {
			this.Close();
		}
	}

	private SwitchTopMenu(direction: 1 | -1): void {
		const tops = this.Items.filter((item) => item.Items && !item.Disabled);
		const index = tops.findIndex((item) => item.Id === this._openPath[0]);
		this.Open(tops[(index + direction + tops.length) % tops.length]!.Id);
	}
}
