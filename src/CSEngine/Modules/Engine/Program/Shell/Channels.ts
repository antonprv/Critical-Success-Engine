// Created by Anton Piruev in 2026.
// Any direct commercial use of derivative work is strictly prohibited.

/** The IPC channels between a program's page (its preload) and its main process. */
export const ProgramChannels = {
	Args: "program:args",
	StartFiles: "program:start-files",
	OpenDialog: "program:open-dialog",
	SaveDialog: "program:save-dialog",
	ReadText: "program:read-text",
	WriteText: "program:write-text",
	SetTitle: "program:set-title",
	Quit: "program:quit",
	/** Main → page: files a second launch handed over. */
	OpenFiles: "program:open-files",
} as const;

/** A call's answer: its value, or the error's message (the page reads the message, not Electron's wrapping). */
export type IpcAnswer<T> = { ok: true; value: T; } | { ok: false; error: string; };
