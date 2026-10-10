// @vitest-environment jsdom
// @vitest-environment-options {"url": "http://test.invalid/"}
// Created by Anton Piruev in 2026.
// Any direct commercial use of derivative work is strictly prohibited.

// The main-thread side: page bootstrap (App.ts), the Vue/Quasar UI, the bridges between DOM and workers, and worker creation.

import { Notify } from "quasar";
import { nextTick } from "vue";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { AudioPlayer } from "../Source/Audio/AudioPlayer";
import { CreateUi } from "../Source/Ui/CreateUi";
import { UiStore } from "../Source/Ui/UiStore";
import { InputEvtType, MenuMode, PhysicsMsg, RenderMsg, SoundAction, SoundType, UiMsg } from "../Source/Workers/Common/CommonEnums";
import { DomInputBridge } from "../Source/Workers/OrchestratorUtils/DomInputBridge";
import type { GameWorkers } from "../Source/Workers/OrchestratorUtils/GameWorkers";
import { UiBridge } from "../Source/Workers/OrchestratorUtils/UiBridge";
import { SilenceConsole } from "./helpers";

const settle = async (): Promise<void> => { await nextTick(); await new Promise((resolve) => setTimeout(resolve, 30)); await nextTick(); };

/** A Worker stand-in that records what is sent to it. */
class FakeWorker {
	public static created: FakeWorker[] = [];
	public readonly sent: { message: unknown; transfer?: Transferable[] | undefined; }[] = [];
	public onmessage: ((event: { data: unknown; }) => void) | null = null;
	public terminated = false;
	public constructor(public readonly url: URL, public readonly options: WorkerOptions) { FakeWorker.created.push(this); }
	public postMessage(message: unknown, transfer?: Transferable[]): void { this.sent.push({ message, transfer }); }
	public terminate(): void { this.terminated = true; }
}

/** An AudioContext stand-in: records buffers started, with or without a panner in between. */
class FakeAudioContext {
	public static last: FakeAudioContext;
	public readonly destination = { name: "speakers" };
	public readonly started: { buffer: unknown; via: string; position?: number[]; }[] = [];
	public resumed = 0;
	public decodeAudioData = vi.fn((data: ArrayBuffer) => Promise.resolve({ decodedFrom: data.byteLength }));
	public constructor() { FakeAudioContext.last = this; }
	public resume(): Promise<void> { this.resumed++; return Promise.resolve(); }
	public createBuffer(channels: number, length: number, sampleRate: number) {
		const data: Float32Array[] = [];
		return { channels, length, sampleRate, data, copyToChannel: (channel: Float32Array, index: number) => { data[index] = channel; } };
	}
	public createBufferSource = () => {
		const context = this as FakeAudioContext;
		const source = {
			buffer: null as unknown,
			target: "" as string,
			position: undefined as number[] | undefined,
			connect(node: { name?: string; positionX?: { value: number; }; positionY?: { value: number; }; positionZ?: { value: number; }; connect?: unknown; }) {
				if (node === context.destination) { source.target = "speakers"; return node; }
				source.target = "panner";
				source.position = [node.positionX!.value, node.positionY!.value, node.positionZ!.value];
				return { connect: () => context.destination };
			},
			start() { context.started.push({ buffer: source.buffer, via: source.target, ...(source.position ? { position: source.position } : {}) }); },
		};
		return source;
	};
	public createPanner() {
		return { positionX: { value: 0 }, positionY: { value: 0 }, positionZ: { value: 0 } };
	}
}

beforeEach(() => {
	// Quasar's Platform reads the screen orientation, which jsdom does not implement.
	Object.defineProperty(window.screen, "orientation", {
		configurable: true,
		value: { type: "landscape-primary", angle: 0, addEventListener: () => undefined, removeEventListener: () => undefined },
	});
	FakeWorker.created = [];
	vi.stubGlobal("Worker", FakeWorker);
	vi.stubGlobal("AudioContext", FakeAudioContext);
	document.body.innerHTML = "";
});
afterEach(() => {
	vi.doUnmock("../Source/Workers/Orchestrator");
	vi.resetModules();
	delete (document as unknown as { pointerLockElement?: unknown; }).pointerLockElement;
});

function LockTo(element: Element | null): void {
	Object.defineProperty(document, "pointerLockElement", { configurable: true, get: () => element });
}

describe("UiStore", () => {
	it("starts in the loading state and merges partial patches per section", () => {
		const store = new UiStore();
		expect(store.State.loading.visible).toBe(true);
		expect(store.State.menu.visible).toBe(false);

		store.ApplyPatch({ loading: { visible: false, label: "x", fraction: 1 } });
		store.ApplyPatch({ menu: { ...store.State.menu, visible: true } });
		store.ApplyPatch({ hud: { visible: true, lines: ["a"], bars: [] } });
		store.ApplyPatch({});
		expect(store.State.loading.visible).toBe(false);
		expect(store.State.menu.visible).toBe(true);
		expect(store.State.hud.lines).toEqual(["a"]);
	});

	it("its default actions do nothing until a bridge takes over", () => {
		const store = new UiStore();
		expect(() => { store.Actions.Resume(); store.Actions.SelectScene("a"); store.Actions.Pause(); store.Actions.SetTouchMode(true); }).not.toThrow();
	});
});

describe("the Vue/Quasar UI (Windows XP look)", () => {
	function Mount() {
		const store = new UiStore();
		const root = document.createElement("div");
		document.body.appendChild(root);
		const app = CreateUi(store, root);
		return { store, root, app };
	}
	const scenes = [{ id: "a", name: "Alpha", description: "first" }, { id: "b", name: "Beta", description: "second" }];
	const buttonByText = (root: ParentNode, text: string): HTMLButtonElement =>
		[...root.querySelectorAll("button")].find((b) => b.textContent?.trim() === text) as HTMLButtonElement;

	it("the loading screen shows the label and an XP start-up progress bar (value clamped to 0-100)", async () => {
		const { store, root, app } = Mount();
		store.ApplyPatch({ loading: { visible: true, label: "Starting renderer…", fraction: 0.3 } });
		await settle();
		const overlay = root.querySelector(".loading-overlay")!;
		expect(overlay.textContent).toContain("Starting renderer…");
		expect(overlay.textContent).toContain("Games Sample");
		const bar = overlay.querySelector("[role=progressbar]")!;
		expect(bar.classList.contains("xp-progress--boot")).toBe(true);
		expect(bar.getAttribute("aria-valuenow")).toBe("30");
		expect((bar.querySelector(".xp-progress__fill") as HTMLElement).style.width).toBe("30%");

		store.ApplyPatch({ loading: { visible: true, label: "", fraction: 1.7 } });
		await settle();
		expect(bar.getAttribute("aria-valuenow")).toBe("100");
		store.ApplyPatch({ loading: { visible: true, label: "", fraction: -1 } });
		await settle();
		expect(bar.getAttribute("aria-valuenow")).toBe("0");

		store.ApplyPatch({ loading: { visible: false, label: "", fraction: 1 } });
		await vi.waitFor(() => expect(root.querySelector(".loading-overlay")).toBeNull(), { timeout: 2000 }); // after the fade-out
		app.unmount();
	});

	it("the start menu is an XP window: title bar, Play, the scene list with the current one marked, and a status bar", async () => {
		const { store, root, app } = Mount();
		const resume = vi.fn(), select = vi.fn();
		store.Actions = { Resume: resume, SelectScene: select, Pause: vi.fn(), SetTouchMode: vi.fn() };
		store.ApplyPatch({ loading: { visible: false, label: "", fraction: 1 }, menu: { visible: true, mode: MenuMode.Start, currentSceneId: "b", scenes } });
		await settle();

		const card = root.querySelector(".menu-card")!;
		expect(card.getAttribute("role")).toBe("dialog");
		expect(card.querySelector(".titlebar")!.textContent).toContain("Games Sample");
		expect(card.textContent).toContain("Ready");
		expect(card.textContent).toContain("Click Play to take control of the mouse.");
		const items = [...card.querySelectorAll(".q-item")];
		expect(items.map((i) => i.textContent)).toEqual([expect.stringContaining("Alpha"), expect.stringContaining("Beta")]);
		expect(items[1]!.textContent).toContain("current");
		expect(items[1]!.classList.contains("scene-row--current")).toBe(true);
		expect(items[0]!.textContent).not.toContain("current");
		expect([...card.querySelectorAll(".statusbar__panel")].map((p) => p.textContent)).toEqual(["2 scenes", "Beta"]);

		buttonByText(card, "Play").click();
		(items[0] as HTMLElement).click();
		expect(resume).toHaveBeenCalledTimes(1);
		expect(select).toHaveBeenCalledWith("a");
		app.unmount();
	});

	it("closing the menu window goes back to the game", async () => {
		const { store, root, app } = Mount();
		const resume = vi.fn();
		store.Actions = { Resume: resume, SelectScene: vi.fn(), Pause: vi.fn(), SetTouchMode: vi.fn() };
		store.ApplyPatch({ loading: { visible: false, label: "", fraction: 1 }, menu: { visible: true, mode: MenuMode.Paused, currentSceneId: "a", scenes } });
		await settle();

		const close = root.querySelector<HTMLButtonElement>(".titlebar__close")!;
		expect(close.getAttribute("aria-label")).toBe("Close menu");
		close.click();
		expect(resume).toHaveBeenCalledTimes(1);
		app.unmount();
	});

	it("the paused menu says Resume; while something loads its buttons and rows are disabled; the status bar copes with one or no current scene", async () => {
		const { store, root, app } = Mount();
		store.ApplyPatch({
			loading: { visible: true, label: "Loading…", fraction: 0.5 },
			menu: { visible: true, mode: MenuMode.Paused, currentSceneId: null, scenes: [scenes[0]!] },
		});
		await settle();
		const card = root.querySelector(".menu-card")!;
		expect(card.textContent).toContain("Paused");
		expect(card.textContent).toContain("Mouse released.");
		expect(buttonByText(card, "Resume").disabled).toBe(true);
		expect(card.querySelector<HTMLButtonElement>(".titlebar__close")!.disabled).toBe(true);
		expect(card.querySelector(".q-item")!.classList.contains("disabled")).toBe(true);
		expect([...card.querySelectorAll(".statusbar__panel")].map((p) => p.textContent)).toEqual(["1 scene", "No scene loaded"]);
		app.unmount();
	});

	it("the taskbar under the menu shows the window's task and a clock that keeps time, and stops its timer when closed", async () => {
		vi.useFakeTimers({ toFake: ["setInterval", "clearInterval", "Date"] });
		vi.setSystemTime(new Date(2026, 9, 3, 9, 5, 0));
		const clear = vi.spyOn(globalThis, "clearInterval");
		try {
			const { store, root, app } = Mount();
			store.ApplyPatch({ loading: { visible: false, label: "", fraction: 1 }, menu: { visible: true, mode: MenuMode.Start, currentSceneId: null, scenes } });
			await nextTick();
			const taskbar = root.querySelector(".taskbar")!;
			expect(taskbar.querySelector(".task-button")!.textContent).toBe("Games Sample");
			expect(taskbar.textContent).toContain("174 BPM");
			expect(taskbar.querySelectorAll(".equalizer__bar")).toHaveLength(5);
			expect(taskbar.querySelector(".clock")!.textContent).toBe("09:05");

			vi.setSystemTime(new Date(2026, 9, 3, 13, 42, 0));
			vi.advanceTimersByTime(1000);
			await nextTick();
			expect(taskbar.querySelector(".clock")!.textContent).toBe("13:42");

			app.unmount();
			expect(clear).toHaveBeenCalled();
		} finally {
			vi.useRealTimers();
		}
	});

	it("the HUD is an XP tooltip with lines and green progress bars, only while nothing covers the game", async () => {
		const { store, root, app } = Mount();
		store.ApplyPatch({
			loading: { visible: false, label: "", fraction: 1 },
			hud: { visible: true, lines: ["Coins: 1 / 9", "Time: 42.0"], bars: [{ id: "hp", label: "HP 40/100", value: 0.4 }] },
		});
		await settle();
		expect([...root.querySelectorAll(".hud-line")].map((e) => e.textContent)).toEqual(["Coins: 1 / 9", "Time: 42.0"]);
		expect(root.querySelector(".hud-bar-label")?.textContent).toBe("HP 40/100");
		const bar = root.querySelector(".hud [role=progressbar]")!;
		expect(bar.classList.contains("xp-progress--luna")).toBe(true);
		expect(bar.getAttribute("aria-label")).toBe("HP 40/100");
		expect(bar.getAttribute("aria-valuenow")).toBe("40");

		store.ApplyPatch({ menu: { ...store.State.menu, visible: true } });
		await settle();
		expect(root.querySelector(".hud")).toBeNull();
		app.unmount();
	});

	it("an empty HUD draws no box at all", async () => {
		const { store, root, app } = Mount();
		store.ApplyPatch({ loading: { visible: false, label: "", fraction: 1 }, hud: { visible: true, lines: [], bars: [] } });
		await settle();
		expect(root.querySelector(".hud")).toBeNull();
		app.unmount();
	});
});

describe("UiBridge", () => {
	function Make() {
		const canvas = document.createElement("canvas");
		document.body.appendChild(canvas);
		const ui = new FakeWorker(new URL("http://x/ui.js"), {});
		const store = new UiStore();
		const bridge = new UiBridge({ UiWorker: ui } as unknown as GameWorkers, canvas, store);
		const fromUi = (data: unknown): void => ui.onmessage!({ data });
		const sent = () => ui.sent.map((s) => s.message);
		return { canvas, ui, store, bridge, fromUi, sent };
	}

	it("the touch scheme: the UI worker is told; Resume doesn't ask for the mouse; Pause and Esc pause", () => {
		const { canvas, store, bridge, sent } = Make();
		const lock = vi.fn();
		canvas.requestPointerLock = lock as never;
		store.State.loading.visible = false;
		bridge.SetTouchMode(true);
		expect(sent()).toContainEqual({ type: UiMsg.SetTouch, enabled: true });
		bridge.Resume();
		expect(lock).not.toHaveBeenCalled();
		bridge.Pause();
		window.dispatchEvent(new KeyboardEvent("keydown", { code: "Escape" })); // a tablet with a keyboard
		expect(sent().filter((m) => (m as { type: UiMsg; }).type === UiMsg.Pause)).toHaveLength(2);
		bridge.SetTouchMode(false);
		bridge.Resume();
		expect(lock).toHaveBeenCalledTimes(1);
	});

	it("the scene's cursor mode reaches the page's store (it decides what Resume and Esc do there)", () => {
		const { store, fromUi } = Make();
		expect(store.State.cursor).toBe("locked");
		fromUi({ type: UiMsg.State, patch: { cursor: "free" } });
		expect(store.State.cursor).toBe("free");
		fromUi({ type: UiMsg.State, patch: { menu: { visible: true } } });
		expect(store.State.cursor).toBe("free"); // other sections leave it alone
	});

	it("in a free-cursor scene Resume doesn't ask for the mouse, and Esc while playing tells the UI worker to pause", () => {
		const { canvas, store, bridge, sent } = Make();
		const lock = vi.fn();
		canvas.requestPointerLock = lock as never;
		store.State.cursor = "free";
		store.State.loading.visible = false; // booted: playing
		bridge.Resume();
		expect(lock).not.toHaveBeenCalled();
		expect(sent()).toContainEqual({ type: UiMsg.Resume });
		window.dispatchEvent(new KeyboardEvent("keydown", { code: "Escape" }));
		expect(sent()).toContainEqual({ type: UiMsg.Pause });
		const count = sent().length;
		store.State.menu.visible = true; // the menu is up: Esc there is the menu's business
		window.dispatchEvent(new KeyboardEvent("keydown", { code: "Escape" }));
		store.State.menu.visible = false;
		store.State.cursor = "locked"; // a held mouse: the browser handles Esc itself
		window.dispatchEvent(new KeyboardEvent("keydown", { code: "Escape" }));
		window.dispatchEvent(new KeyboardEvent("keydown", { code: "KeyW" }));
		expect(sent()).toHaveLength(count);
	});

	it("connects the main thread's plugin channels to the UI worker, both ways", async () => {
		const { ChannelHub } = await import("../Source/Engine/Core/Channels");
		const canvas = document.createElement("canvas");
		const ui = new FakeWorker(new URL("http://x/ui.js"), {});
		const channels = new ChannelHub();
		new UiBridge({ UiWorker: ui } as unknown as GameWorkers, canvas, new UiStore(), channels);
		channels.Post("ui", { op: "event" });
		expect(ui.sent.map((s) => s.message)).toContainEqual({ type: UiMsg.Channel, channel: "ui", payload: { op: "event" } });
		const handler = vi.fn();
		channels.On("ui", handler);
		ui.onmessage!({ data: { type: UiMsg.Channel, channel: "ui", payload: { op: "show" } } });
		expect(handler).toHaveBeenCalledWith({ op: "show" });
	});

	it("becomes the store's actions: Resume asks for the mouse and tells the UI worker; picking a scene is forwarded", () => {
		const { canvas, store, sent } = Make();
		canvas.requestPointerLock = vi.fn(() => Promise.resolve()) as never;

		store.Actions.Resume();
		expect(canvas.requestPointerLock).toHaveBeenCalled();
		expect(sent()).toContainEqual({ type: UiMsg.Resume });

		store.Actions.SelectScene("coin-hunt");
		expect(sent()).toContainEqual({ type: UiMsg.SelectScene, sceneId: "coin-hunt" });
	});

	it("applies state patches from the UI worker", () => {
		const { store, fromUi } = Make();
		fromUi({ type: UiMsg.State, patch: { hud: { visible: true, lines: ["x"], bars: [] } } });
		expect(store.State.hud.lines).toEqual(["x"]);
	});

	it("requests and releases the pointer lock when the UI worker says so; a refusal (rejected, thrown) is reported back", async () => {
		const { canvas, fromUi, sent } = Make();

		canvas.requestPointerLock = vi.fn(() => Promise.resolve()) as never;
		fromUi({ type: UiMsg.RequestPointerLock });
		expect(canvas.requestPointerLock).toHaveBeenCalledTimes(1);

		canvas.requestPointerLock = vi.fn(() => undefined) as never; // older browsers return nothing
		fromUi({ type: UiMsg.RequestPointerLock });

		canvas.requestPointerLock = vi.fn(() => Promise.reject(new DOMException("no", "NotAllowedError"))) as never;
		fromUi({ type: UiMsg.RequestPointerLock });
		await Promise.resolve();
		await Promise.resolve();
		canvas.requestPointerLock = vi.fn(() => { throw new Error("not allowed"); }) as never;
		fromUi({ type: UiMsg.RequestPointerLock });
		expect(sent().filter((m) => (m as { type: UiMsg; }).type === UiMsg.PointerLockFailed)).toHaveLength(2);

		document.exitPointerLock = vi.fn();
		fromUi({ type: UiMsg.ExitPointerLock });
		expect(document.exitPointerLock).toHaveBeenCalled();
	});

	it("shows toasts with Quasar's Notify", () => {
		// Notify.create only exists once the Quasar plugin is installed (CreateUi does that in the real page).
		const notify = Notify as unknown as { create?: unknown; };
		const original = notify.create;
		const create = vi.fn();
		notify.create = create;
		try {
			const { fromUi } = Make();
			fromUi({ type: UiMsg.Toast, message: "Hello" });
			expect(create).toHaveBeenCalledWith(expect.objectContaining({ message: "Hello" }));
		} finally {
			notify.create = original;
		}
	});

	it("reports pointer-lock changes (locked = our canvas) and errors to the UI worker", () => {
		const { canvas, sent } = Make();
		LockTo(canvas);
		document.dispatchEvent(new Event("pointerlockchange"));
		LockTo(document.body);
		document.dispatchEvent(new Event("pointerlockchange"));
		document.dispatchEvent(new Event("pointerlockerror"));

		expect(sent()).toEqual(expect.arrayContaining([{ type: UiMsg.PointerLock, locked: true }, { type: UiMsg.PointerLock, locked: false }, { type: UiMsg.PointerLockFailed }]));
	});
});

describe("DomInputBridge", () => {
	function Make() {
		const canvas = document.createElement("canvas");
		document.body.appendChild(canvas);
		const workers = { RenderWorker: new FakeWorker(new URL("http://x/r.js"), {}), GameLogicWorker: new FakeWorker(new URL("http://x/g.js"), {}), AudioPlayer: { Resume: vi.fn() } };
		new DomInputBridge(workers as unknown as GameWorkers, canvas);
		const inputs = () => workers.GameLogicWorker.sent.map((s) => (s.message as { event: unknown; }).event);
		return { canvas, workers, inputs };
	}

	it("with a free cursor: where it is on the game view, the wheel, leaving the view; wheel and middle button don't scroll the page", () => {
		const { canvas, inputs } = Make();
		canvas.getBoundingClientRect = () => ({ left: 100, top: 50, width: 800, height: 400, right: 900, bottom: 450, x: 100, y: 50, toJSON: () => ({}) });
		const move = new MouseEvent("pointermove", { clientX: 300, clientY: 150 });
		Object.defineProperties(move, { movementX: { value: 2 }, movementY: { value: 1 } });
		canvas.dispatchEvent(move);
		const wheel = new WheelEvent("wheel", { deltaY: 120, cancelable: true });
		canvas.dispatchEvent(wheel);
		const middle = new MouseEvent("pointerdown", { button: 1, cancelable: true });
		canvas.dispatchEvent(middle);
		canvas.dispatchEvent(new MouseEvent("pointerleave"));
		expect(inputs()).toEqual([
			{ kind: InputEvtType.PointerMove, dx: 2, dy: 1, x: 0.25, y: 0.25 },
			{ kind: InputEvtType.Wheel, dy: 120 },
			{ kind: InputEvtType.PointerDown, button: 1 },
			{ kind: InputEvtType.PointerLeave },
		]);
		expect([wheel.defaultPrevented, middle.defaultPrevented]).toEqual([true, true]);
	});

	it("reads the first connected gamepad every frame and sends its state when it changes (an unplugged pad releases everything)", () => {
		const frames: FrameRequestCallback[] = [];
		vi.stubGlobal("requestAnimationFrame", (callback: FrameRequestCallback) => { frames.push(callback); return frames.length; });
		let pads: unknown[] = [null, { connected: true, buttons: [{ value: 1 }, { value: 0.333 }], axes: [0.123, -1] }];
		Object.defineProperty(navigator, "getGamepads", { configurable: true, value: () => pads });
		const { inputs } = Make();
		const tick = () => frames.shift()!(0);
		tick();
		tick(); // the same state: nothing new
		pads = [{ connected: false, buttons: [], axes: [] }];
		tick();
		tick();
		expect(inputs()).toEqual([
			{ kind: InputEvtType.Gamepad, buttons: [1, 0.33], axes: [0.12, -1] },
			{ kind: InputEvtType.Gamepad, buttons: [], axes: [] },
		]);
		expect(frames).toHaveLength(1); // still polling
		Object.defineProperty(navigator, "getGamepads", { configurable: true, value: undefined });
		tick(); // a browser without the Gamepad API: nothing, and no error
		expect(inputs()).toHaveLength(2);
	});

	it("forwards key presses (not auto-repeats) and releases", () => {
		const { inputs } = Make();
		window.dispatchEvent(new KeyboardEvent("keydown", { code: "KeyW" }));
		window.dispatchEvent(new KeyboardEvent("keydown", { code: "KeyW", repeat: true }));
		window.dispatchEvent(new KeyboardEvent("keyup", { code: "KeyW" }));
		expect(inputs()).toEqual([{ kind: InputEvtType.KeyDown, code: "KeyW" }, { kind: InputEvtType.KeyUp, code: "KeyW" }]);
	});

	it("keeps keys from the page (Space scrolling, ...) only while the game has the mouse", () => {
		const { canvas } = Make();
		const free = new KeyboardEvent("keydown", { code: "Space", cancelable: true });
		window.dispatchEvent(free);
		expect(free.defaultPrevented).toBe(false);

		LockTo(canvas);
		const down = new KeyboardEvent("keydown", { code: "Space", cancelable: true });
		const up = new KeyboardEvent("keyup", { code: "Space", cancelable: true });
		window.dispatchEvent(down);
		window.dispatchEvent(up);
		expect(down.defaultPrevented).toBe(true);
		expect(up.defaultPrevented).toBe(true);
	});

	it("releases every key when the window loses focus or the pointer lock changes", () => {
		const { inputs } = Make();
		window.dispatchEvent(new Event("blur"));
		document.dispatchEvent(new Event("pointerlockchange"));
		expect(inputs()).toEqual([{ kind: InputEvtType.ReleaseAll }, { kind: InputEvtType.ReleaseAll }]);
	});

	it("forwards mouse buttons and movement on the canvas, and blocks its context menu", () => {
		const { canvas, inputs } = Make();
		canvas.dispatchEvent(new MouseEvent("pointerdown", { button: 0, bubbles: true }));
		canvas.dispatchEvent(new MouseEvent("pointerup", { button: 2 }));
		const move = new MouseEvent("pointermove");
		Object.defineProperties(move, { movementX: { value: 5 }, movementY: { value: -3 } });
		canvas.dispatchEvent(move);
		const menu = new MouseEvent("contextmenu", { cancelable: true });
		canvas.dispatchEvent(menu);

		expect(inputs()).toEqual([
			{ kind: InputEvtType.PointerDown, button: 0 },
			{ kind: InputEvtType.PointerUp, button: 2 },
			{ kind: InputEvtType.PointerMove, dx: 5, dy: -3 },
		]);
		expect(menu.defaultPrevented).toBe(true);
	});

	it("tells the renderer about window resizes", () => {
		const { workers } = Make();
		window.dispatchEvent(new Event("resize"));
		expect(workers.RenderWorker.sent[0]!.message).toMatchObject({ type: RenderMsg.Resize, width: 0, height: 0, devicePixelRatio: window.devicePixelRatio });
	});

	it("unlocks audio on the first click or key press, once", () => {
		const first = Make();
		window.dispatchEvent(new MouseEvent("pointerdown"));
		window.dispatchEvent(new KeyboardEvent("keydown", { code: "KeyA" }));
		expect(first.workers.AudioPlayer.Resume).toHaveBeenCalledTimes(1);

		const second = Make();
		window.dispatchEvent(new KeyboardEvent("keydown", { code: "KeyA" }));
		expect(second.workers.AudioPlayer.Resume).toHaveBeenCalledTimes(1);
	});
});

describe("AudioPlayer", () => {
	function Make() {
		const worker = new FakeWorker(new URL("http://x/a.js"), {});
		const player = new AudioPlayer(worker as unknown as Worker);
		const send = (data: unknown): void => worker.onmessage!({ data });
		return { player, context: FakeAudioContext.last, send };
	}

	it("Resume resumes the audio context (browsers start it suspended)", () => {
		const { player, context } = Make();
		player.Resume();
		expect(context.resumed).toBe(1);
	});

	it("plays decoded PCM straight away - positioned through a panner, or directly", () => {
		const { context, send } = Make();
		const channel = new Float32Array([0.5, 0.25]);
		send({ action: SoundAction.PlaySound, soundId: "a", sound: { kind: SoundType.Pcm, sampleRate: 22050, channels: [channel] }, position: [1, 2, 3] });
		send({ action: SoundAction.PlaySound, soundId: "a", sound: { kind: SoundType.Pcm, sampleRate: 22050, channels: [] } });

		expect(context.started[0]).toMatchObject({ via: "panner", position: [1, 2, 3], buffer: { channels: 1, length: 2, sampleRate: 22050 } });
		expect((context.started[0]!.buffer as { data: Float32Array[]; }).data[0]).toBe(channel);
		expect(context.started[1]).toMatchObject({ via: "speakers", buffer: { length: 0 } });
	});

	it("decodes encoded sounds once and replays the cached buffer", async () => {
		const { context, send } = Make();
		send({ action: SoundAction.PlaySound, soundId: "boom", sound: { kind: SoundType.Encoded, data: new ArrayBuffer(16) } });
		await Promise.resolve();
		await Promise.resolve();
		send({ action: SoundAction.PlaySound, soundId: "boom", sound: { kind: SoundType.Encoded, data: new ArrayBuffer(16) } });

		expect(context.decodeAudioData).toHaveBeenCalledTimes(1);
		expect(context.started.map((s) => s.buffer)).toEqual([{ decodedFrom: 16 }, { decodedFrom: 16 }]);
	});

	it("logs a sound it cannot decode, and ignores other messages", async () => {
		const log = SilenceConsole();
		const { context, send } = Make();
		context.decodeAudioData.mockImplementationOnce(() => Promise.reject(new Error("corrupt")));
		send({ action: SoundAction.PlaySound, soundId: "bad", sound: { kind: SoundType.Encoded, data: new ArrayBuffer(4) } });
		send({ action: 99, soundId: "x" });
		await new Promise((resolve) => setTimeout(resolve, 0));

		expect(String(log.error.mock.calls[0]![0])).toContain('[AudioPlayer] failed to decode "bad"');
		expect(context.started).toEqual([]);
	});
});

describe("GameWorkers and Orchestrator", () => {
	function Canvas(): HTMLCanvasElement {
		const canvas = document.createElement("canvas");
		(canvas as unknown as { transferControlToOffscreen: () => unknown; }).transferControlToOffscreen = () => ({ offscreen: true });
		document.body.appendChild(canvas);
		return canvas;
	}

	it("starts the five workers as ES modules and connects them with message channels", async () => {
		const { GameWorkers } = await import("../Source/Workers/OrchestratorUtils/GameWorkers");
		const workers = new GameWorkers(Canvas(), true);

		expect(FakeWorker.created.map((w) => w.url.pathname.split("/").pop())).toEqual(["RenderWorker.ts", "PhysicsWorker.ts", "GameLogicWorker.ts", "AudioWorker.ts", "UiWorker.ts"]);
		expect(FakeWorker.created.every((w) => w.options.type === "module")).toBe(true);

		const init = (worker: Worker) => (worker as unknown as FakeWorker).sent[0]!;
		const render = init(workers.RenderWorker), physics = init(workers.PhysicsWorker), logic = init(workers.GameLogicWorker), audio = init(workers.AudioWorker), ui = init(workers.UiWorker);
		expect(render.message).toMatchObject({ type: RenderMsg.Init, canvas: { offscreen: true }, devMode: true });
		expect(physics.message).toMatchObject({ type: PhysicsMsg.Init, settings: { gravity: [0, -20, 0] } });
		expect((physics.message as { fixedTimestepMs: number; }).fixedTimestepMs).toBeGreaterThan(0);

		// Each GameLogic port is the other end of the channel handed to that worker.
		const logicInit = logic.message as Record<string, MessagePort>;
		expect(logic.transfer).toHaveLength(4);
		expect(render.transfer).toEqual([{ offscreen: true }, (render.message as { gameLogicPort: unknown; }).gameLogicPort]);
		expect(audio.transfer).toEqual([(audio.message as { gameLogicPort: unknown; }).gameLogicPort]);
		expect(ui.transfer).toEqual([(ui.message as { gameLogicPort: unknown; }).gameLogicPort]);
		expect(new Set([logicInit["renderPort"], logicInit["physicsPort"], logicInit["audioPort"], logicInit["uiPort"]]).size).toBe(4);
		expect(logicInit["baseUrl"]).toBe(new URL(".", document.baseURI).href); // where the game's files (data/*.csedata) are

		expect(workers.AudioPlayer.constructor.name).toBe("AudioPlayer"); // (a fresh module instance: compare by name)
		workers.Dispose();
		expect(FakeWorker.created.every((w) => w.terminated)).toBe(true);
	});

	it("the Orchestrator puts the workers and both bridges together, and Dispose stops the workers", async () => {
		const { Orchestrator } = await import("../Source/Workers/Orchestrator");
		const store = new UiStore();
		const orchestrator = new Orchestrator(Canvas(), false, store);
		expect(FakeWorker.created).toHaveLength(5);
		expect(store.Actions.constructor.name).toBe("UiBridge");

		orchestrator.Dispose();
		expect(FakeWorker.created.every((w) => w.terminated)).toBe(true);
	});
});

describe("App.ts (page bootstrap)", () => {
	it("adds the canvas and the UI mount, replaces the boot splash, and starts the orchestrator in dev mode", async () => {
		document.body.innerHTML = '<div id="boot-splash">Loading…</div>';
		const created: unknown[][] = [];
		vi.doMock("../Source/Workers/Orchestrator", () => ({ Orchestrator: vi.fn(function (...args: unknown[]) { created.push(args); }) }));

		await import("../Source/App");
		// After the page's own modules started (the UI host brings the toolkit's Vue components: slow on a busy machine).
		await vi.waitFor(() => expect(created).toHaveLength(1), { timeout: 10_000 });

		const canvas = document.getElementById("gameCanvas") as HTMLCanvasElement;
		expect(canvas.style.width).toBe("100%");
		expect(document.getElementById("ui")).not.toBeNull();
		expect(document.getElementById("boot-splash")).toBeNull();
		expect(created[0]![0]).toBe(canvas);
		expect(created[0]![1]).toBe(true); // __DEV__ in tests
		// The UI plugin draws the loading screen (the engine's EngineLoading document), not the page's own overlay.
		await vi.waitFor(() => expect(document.querySelector('[data-ui="EngineLoading"] [data-name="Status"]')?.textContent).toBe("Starting workers…"), { timeout: 10_000 });
		expect(document.querySelector(".loading-overlay")).toBeNull();
		// The page is a thread of its own: its ModuleManager runs the engine (and the page's plugin modules).
		const { ModuleManager, ModuleThread } = await import("../Source/Engine/Modules/ModuleManager");
		const modules = ModuleManager.Get();
		expect(modules.Thread).toBe(ModuleThread.Main);
		expect(modules.IsModuleLoaded("Engine")).toBe(true);
		expect(created[0]![3]).toBe(modules.GetModuleChecked<{ Channels: unknown; } & InstanceType<typeof import("../Source/Engine/Modules/ModuleManager").ModuleInterface>>("Engine").Channels);
	}, 20_000); // the page starts its own modules first (the UI host brings the toolkit's Vue components): slow on a busy machine

	it("asks the browser to keep the storage persistent, and logs the answer (a browser without the API: nothing)", async () => {
		const log = SilenceConsole();
		const orchestrator = vi.fn();
		vi.doMock("../Source/Workers/Orchestrator", () => ({ Orchestrator: orchestrator }));
		/** Starts the page and waits until its bootstrap is done (nothing of it may run into the next test). */
		const boot = async (storage: unknown, runs: number) => {
			Object.defineProperty(navigator, "storage", { configurable: true, value: storage });
			vi.resetModules();
			await import("../Source/App");
			await vi.waitFor(() => expect(orchestrator).toHaveBeenCalledTimes(runs), { timeout: 10_000 });
		};
		const persist = vi.fn(async () => true);
		await boot({ persist }, 1);
		await vi.waitFor(() => expect(log.log.mock.calls.map((c) => String(c[0]))).toEqual(expect.arrayContaining([expect.stringContaining("[App] Persistent storage granted")])));
		expect(persist).toHaveBeenCalledTimes(1);
		await boot({ persist: async () => false }, 2);
		await vi.waitFor(() => expect(log.log.mock.calls.map((c) => String(c[0]))).toEqual(expect.arrayContaining([expect.stringContaining("[App] Persistent storage not granted")])));
		await boot({ persist: () => Promise.reject(new Error("no")) }, 3);
		await boot(undefined, 4); // a browser without the Storage API
	}, 30_000);

	it("logs the page's modules that failed to start and the plugins it could not enable", async () => {
		const log = SilenceConsole();
		vi.doMock("../Source/Workers/Orchestrator", () => ({ Orchestrator: vi.fn() }));
		vi.doMock("../Source/Project", async (original) => {
			const real = await original<typeof import("../Source/Project")>();
			return {
				...real,
				GameProject: { ...real.GameProject, Plugins: [{ Name: "Ghost", Enabled: true }], Modules: [{ Name: "PageBroken", Type: "Runtime", LoadingPhase: "Default", Thread: "Main", Load: () => Promise.reject(new Error("404")) }] },
			};
		});
		await import("../Source/App");
		await vi.waitFor(() => expect(log.error.mock.calls.map((c) => String(c[0]))).toEqual(expect.arrayContaining([
			expect.stringContaining('[App] The project enables "Ghost", which is not installed'),
			expect.stringContaining('[App] Module "PageBroken" failed to load: Its code could not be loaded: 404'),
		])));
		vi.doUnmock("../Source/Project");
	});

	it("when the workers cannot start, the loading screen says so", async () => {
		const log = SilenceConsole();
		vi.doMock("../Source/Workers/Orchestrator", () => ({ Orchestrator: vi.fn(function () { throw new Error("no Worker support"); }) }));

		await import("../Source/App");
		await vi.waitFor(() => expect(document.querySelector('[data-ui="EngineLoading"] [data-name="Status"]')?.textContent).toBe("Failed to start. Please refresh."), { timeout: 10_000 });
		expect(String(log.error.mock.calls[0]![0])).toContain("no Worker support");
	});
});
