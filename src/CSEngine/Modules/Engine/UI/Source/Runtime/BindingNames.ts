// Created by Anton Piruev in 2026.
// Any direct commercial use of derivative work is strictly prohibited.

/** What a player reads for a binding's code: "KeyW" is W, "Mouse1" the middle mouse button, "Pad:LeftStickUp" left stick up. */

const Named: Record<string, string> = {
	"": "-", ArrowUp: "Up", ArrowDown: "Down", ArrowLeft: "Left", ArrowRight: "Right",
	Mouse0: "Left mouse", Mouse1: "Middle mouse", Mouse2: "Right mouse", Mouse3: "Mouse 4", Mouse4: "Mouse 5",
	"Pad:LB": "Left bumper", "Pad:RB": "Right bumper", "Pad:LT": "Left trigger", "Pad:RT": "Right trigger",
	"Pad:LS": "Left stick press", "Pad:RS": "Right stick press",
	"Pad:DUp": "D-pad up", "Pad:DDown": "D-pad down", "Pad:DLeft": "D-pad left", "Pad:DRight": "D-pad right",
};

const Sides: Record<string, string> = { Left: "Left", Right: "Right" };
const Modifiers: Record<string, string> = { Shift: "Shift", Control: "Ctrl", Alt: "Alt", Meta: "Meta" };

export function BindingName(code: string): string {
	if (code in Named) return Named[code]!;
	const key = /^Key([A-Z])$/.exec(code) ?? /^Digit(\d)$/.exec(code);
	if (key) return key[1]!;
	const numpad = /^Numpad(.+)$/.exec(code);
	if (numpad) return `Num ${numpad[1]}`;
	const modifier = /^(Shift|Control|Alt|Meta)(Left|Right)$/.exec(code);
	if (modifier) return `${Sides[modifier[2]!]} ${Modifiers[modifier[1]!]}`;
	const stick = /^Pad:(Left|Right)Stick(Up|Down|Left|Right)$/.exec(code);
	if (stick) return `${stick[1]} stick ${stick[2]!.toLowerCase()}`;
	if (code.startsWith("Pad:")) return `Pad ${code.slice(4)}`;
	return code;
}
