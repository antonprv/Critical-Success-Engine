// Created by Anton Piruev in 2026.
// Any direct commercial use of derivative work is strictly prohibited.

import { ControlBase } from "../Core/ControlBase";

/** The toasts showing now, oldest first. The page owns their lifetime (it drops each after a while), so no timers here. */
export class ToastController extends ControlBase<Record<string, unknown[]>> {
	public Items: string[] = [];

	public SetItems(texts: readonly string[]): void {
		this.Items = [...texts];
	}
}
