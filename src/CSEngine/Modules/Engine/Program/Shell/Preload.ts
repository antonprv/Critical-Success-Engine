// Created by Anton Piruev in 2026.
// Any direct commercial use of derivative work is strictly prohibited.

import { contextBridge, ipcRenderer } from "electron";
import type { ProgramNative } from "../Source/Native";
import { ProgramChannels, type IpcAnswer } from "./Channels";

/** Calls the main process; a failure comes back as an Error with the main process's own message. */
async function Call<T>(channel: string, ...args: unknown[]): Promise<T> {
	const answer = await ipcRenderer.invoke(channel, ...args) as IpcAnswer<T>;
	if (!answer.ok) throw new Error(answer.error);
	return answer.value;
}

/** The page sees only this (window.cseProgram), never Node or Electron: context isolation. */
const native: ProgramNative = {
	Args: () => Call(ProgramChannels.Args),
	StartFiles: () => Call(ProgramChannels.StartFiles),
	OpenDialog: (options = {}) => Call(ProgramChannels.OpenDialog, options),
	SaveDialog: (options = {}) => Call(ProgramChannels.SaveDialog, options),
	ReadText: (path) => Call(ProgramChannels.ReadText, path),
	WriteText: (path, text) => Call(ProgramChannels.WriteText, path, text),
	SetTitle: (title) => Call(ProgramChannels.SetTitle, title),
	OnOpenFiles: (listener) => {
		const handler = (_event: unknown, files: string[]): void => listener(files);
		ipcRenderer.on(ProgramChannels.OpenFiles, handler);
		return () => ipcRenderer.removeListener(ProgramChannels.OpenFiles, handler);
	},
	Quit: (code = 0) => Call(ProgramChannels.Quit, code),
};

contextBridge.exposeInMainWorld("cseProgram", native);
