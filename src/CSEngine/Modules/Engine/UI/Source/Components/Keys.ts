// Created by Anton Piruev in 2026.
// Any direct commercial use of derivative work is strictly prohibited.

import type { InjectionKey } from "vue";
import type { Area } from "../Controls/WindowController";

/** Provided by WinDesktop: the size windows maximize to. */
export const DesktopAreaKey: InjectionKey<() => Area> = Symbol("win-desktop-area");
