// Created by Anton Piruev in 2026.
// Any direct commercial use of derivative work is strictly prohibited.

// Unlike the C# FastMath there are no bit tricks here: V8 compiles Math.sqrt to
// the sqrtsd instruction, faster than a Quake-style inverse square root done
// through typed arrays. What does pay off is not calling Math.hypot, which
// handles varargs and overflow and is ~18x slower than the plain formula.

export function Sqrt( value: number ): number {
	return Math.sqrt( value );
}

export function InvSqrt( value: number ): number {
	return 1 / Math.sqrt( value );
}

export function Length2( x: number, y: number ): number {
	return Math.sqrt( x * x + y * y );
}

export function Length3( x: number, y: number, z: number ): number {
	return Math.sqrt( x * x + y * y + z * z );
}

export function LengthSq3( x: number, y: number, z: number ): number {
	return x * x + y * y + z * z;
}

export function Distance3(
	ax: number,
	ay: number,
	az: number,
	bx: number,
	by: number,
	bz: number,
): number {
	const dx = bx - ax;
	const dy = by - ay;
	const dz = bz - az;

	return Math.sqrt( dx * dx + dy * dy + dz * dz );
}
