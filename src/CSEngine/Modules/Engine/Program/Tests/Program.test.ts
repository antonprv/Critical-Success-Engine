// Created by Anton Piruev in 2026.
// Any direct commercial use of derivative work is strictly prohibited.

import { flushPromises } from "@vue/test-utils";
import { describe, expect, it, vi } from "vitest";
import { MemoryBackend } from "@cse/core/Engine/Storage/SettingsStorage";
import type { ButtonController, TextBoxController, UiManifest } from "@cse/ui";
import { Application, BrowserNative, DefaultProgramTheme, Form, NativeOf, ProgramLook, SetProgramTheme, StartProgram, type ProgramNative } from "../Source/Index";

const Layout = (name: string) => JSON.stringify({
	Format: 1, Name: name, Script: "",
	Root: {
		Name: "Root", Type: "canvas", X: 0, Y: 0, Width: 400, Height: 300, Props: {}, Children: [
			{ Name: "NameBox", Type: "textbox", X: 10, Y: 10, Width: 200, Height: 24, Props: { Text: "" } },
			{ Name: "GreetButton", Type: "button", X: 10, Y: 40, Width: 100, Height: 24, Props: { Text: "Greet" } },
		],
	},
});

function Native(): ProgramNative & { Quit: ReturnType<typeof vi.fn>; SetTitle: ReturnType<typeof vi.fn>; } {
	return {
		Args: vi.fn(async () => ["--flag", "file.txt"]),
		StartFiles: vi.fn(async () => []),
		OpenDialog: vi.fn(async () => ["C:/picked.txt"]),
		SaveDialog: vi.fn(async () => null),
		ReadText: vi.fn(async () => "one\ntwo"),
		WriteText: vi.fn(async () => undefined),
		SetTitle: vi.fn(async () => undefined),
		OnOpenFiles: vi.fn(() => () => undefined),
		Quit: vi.fn(async () => undefined),
	};
}

class Greeter extends Form {
	public static Last: Greeter | null = null;
	public override OnConstruct(): void {
		Greeter.Last = this;
		this.On("GreetButton", "click", () => {
			const name = this.Widget<TextBoxController>("NameBox").Value;
			this.Settings.Set("Last", name);
			this.SetText("GreetButton", `Hi ${name}`);
		});
	}

	public Services() {
		return { Application: this.Application, Native: this.Native, Settings: this.Settings };
	}
}

const Manifest = (): UiManifest => ({ FileVersion: 1, Documents: [{ Id: "Main", Path: "Main.ui.json", Script: "" }, { Id: "Tool", Path: "Tool.ui.json", Script: "" }] });

describe("a program", () => {
	it("starts: its settings, its args, main, the main form in its theme; closing the main form ends it", async () => {
		const native = Native();
		const mount = document.createElement("div");
		document.body.append(mount);
		const startup = vi.fn();
		const exit = vi.fn();
		Application.Events.On("startup", startup);
		Application.Events.On("exit", exit);
		let args: string[] = [];
		const app = await StartProgram(mount, {
			Name: "Hello", Manifest: Manifest(), Documents: { "Main.ui.json": Layout("Main"), "Tool.ui.json": Layout("Tool") }, Native: native, Storage: new MemoryBackend(),
			Main: async (a) => {
				args = a;
				await Application.Run(Greeter, "Main");
			},
		});
		await flushPromises();
		expect(native.SetTitle).toHaveBeenCalledWith("Hello");
		expect(args).toEqual(["--flag", "file.txt"]);
		expect(Application.Args).toEqual(["--flag", "file.txt"]);
		expect(startup).toHaveBeenCalledWith(["--flag", "file.txt"]);
		expect(Application.MainForm).toBe("Main");
		expect(ProgramLook()).toEqual(DefaultProgramTheme);
		expect(mount.querySelector(".win-kit--quasar")).not.toBeNull();

		const main = Application.Host.Manager.Get("Main")!;
		main.Controller<TextBoxController>("NameBox").SetValue("Ann");
		main.Controller<ButtonController>("GreetButton").PerformClick();
		expect(main.Controller<ButtonController>("GreetButton").Label).toBe("Hi Ann");
		expect(Application.Host.Settings.Get("Last", "")).toBe("Ann");
		const services = Greeter.Last!.Services();
		expect(services.Application).toBe(Application);
		expect(services.Native).toBe(native);

		// Another form, the same class twice: registered once.
		await Application.ShowForm(Greeter, "Tool");
		Application.Host.Manager.Hide("Tool");
		await Application.ShowForm(Greeter, "Tool");
		await expect(Application.ShowForm(Greeter, "Nope")).rejects.toThrow(/no UI document "Nope".*Main, Tool/);

		main.Close();
		await flushPromises();
		expect(exit).toHaveBeenCalledWith(0);
		expect(native.Quit).toHaveBeenCalledWith(0);
		await Application.Exit(3);
		expect(native.Quit).toHaveBeenCalledTimes(1);
		app.unmount();
	});

	it("wears the project's theme and changes it on the fly", async () => {
		const mount = document.createElement("div");
		const app = await StartProgram(mount, {
			Name: "Themed", Manifest: Manifest(), Documents: { "Main.ui.json": Layout("Main") }, Native: Native(), Storage: new MemoryBackend(),
			Theme: { Kit: "tailwind", Theme: "xp-blue", Tailwind: { Accent: "indigo", Neutral: "zinc", Dark: true, Radius: "md" } },
			Main: () => undefined,
		});
		await flushPromises();
		expect(mount.querySelector(".win-kit--tailwind")).not.toBeNull();
		SetProgramTheme({ Kit: "classic", Theme: "xp-blue" });
		await flushPromises();
		expect(ProgramLook().Tailwind).toBeUndefined();
		expect(mount.querySelector(".win-kit--classic")).not.toBeNull();
		app.unmount();
	});

	it("says which document is missing, and that it must start first", async () => {
		const mount = document.createElement("div");
		const app = await StartProgram(mount, {
			Name: "Broken", Manifest: Manifest(), Documents: {}, Native: Native(), Storage: new MemoryBackend(), Main: () => undefined,
		});
		await expect(Application.Run(Greeter, "Main")).rejects.toThrow(/Main.ui.json is not among the program's documents/);
		app.unmount();
		const fresh = new (Application.constructor as new () => typeof Application)();
		expect(() => fresh.Host).toThrow(/has not started/);
		expect(fresh.MainForm).toBeNull();
	});

	it("starts with the browser's stand-ins and IndexedDB when nothing else is given", async () => {
		const mount = document.createElement("div");
		const close = vi.spyOn(window, "close").mockImplementation(() => undefined);
		const app = await StartProgram(mount, { Name: "Plain", Manifest: Manifest(), Documents: {}, Main: () => undefined });
		expect(document.title).toBe("Plain");
		expect(Application.Host.Settings.Backend).toMatch(/IndexedDB|Memory/);
		await Application.Exit();
		expect(close).toHaveBeenCalled();
		app.unmount();
	});
});

describe("the browser's stand-in for the native side", () => {
	it("has no command line or dialogs, keeps files in memory, sets the tab's title, closes the tab", async () => {
		const close = vi.fn();
		const page = { close, document: { title: "" } };
		const native = new BrowserNative(page as never);
		expect(await native.Args()).toEqual([]);
		expect(await native.StartFiles()).toEqual([]);
		expect(await native.OpenDialog()).toEqual([]);
		expect(await native.SaveDialog()).toBeNull();
		await expect(native.ReadText("a.txt")).rejects.toThrow(/no a.txt/);
		await native.WriteText("a.txt", "x");
		expect(await native.ReadText("a.txt")).toBe("x");
		await native.SetTitle("T");
		expect(page.document.title).toBe("T");
		native.OnOpenFiles()();
		await native.Quit();
		expect(close).toHaveBeenCalled();
	});

	it("stands in only when the desktop app's preload isn't there", () => {
		const preload = Native();
		expect(NativeOf({ cseProgram: preload })).toBe(preload);
		expect(NativeOf({})).toBeInstanceOf(BrowserNative);
		expect(NativeOf()).toBeInstanceOf(BrowserNative);
	});
});
