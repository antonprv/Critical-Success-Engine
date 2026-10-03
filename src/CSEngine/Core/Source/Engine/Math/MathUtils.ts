// Created by Anton Piruev in 2026.
// Any direct commercial use of derivative work is strictly prohibited.

export const DegToRad = Math.PI / 180;
export const RadToDeg = 180 / Math.PI;

export function Clamp(value: number, min: number, max: number): number {
	return value < min ? min : value > max ? max : value;
}

export function Clamp01(value: number): number {
	return Clamp(value, 0, 1);
}

export function Lerp(from: number, to: number, t: number): number {
	return from + (to - from) * t;
}
