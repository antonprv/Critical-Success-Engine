// Created by Anton Piruev in 2026. 
// Any direct commercial use of derivative work is strictly prohibited.

namespace Framework.FastMath.Core
{
	public static partial class FMath
	{
		public const float KINDA_SMALL_NUMBER = 0.001f;
		public const float SMALL_NUMBER = 0.00001f;
		public const float ACTUALLY_SMALL_NUMBER = 1e-4f;

		public const float PI = 3.14159274f;
		public const float TWO_PI = PI * 2f;
		public const float HALF_PI = PI * 0.5f;
		public const float QUARTER_PI = PI * 0.25f;
		public const float THREE_QTR_PI = PI * 0.75f;
		public const float INV_PI = 1f / PI;
		public const float INV_TWO_PI = 0.5f / PI;     // 1 / (2π)
		public const float INV_360 = 1f / 360f;     // multiply instead of divide by 360

		public const float Deg2Rad = PI * ( 1f / 180f );
		public const float Rad2Deg = 180f / PI;

		#region Precomputed reciprocals

		// Multiply by these instead of dividing; the JIT can constant-fold
		// the expression at the call site when the divisor is a literal.
		// Stored here so every file can share them without duplication.
		public const float INV_3 = 1f / 3f;
		public const float INV_6 = 1f / 6f;
		public const float INV_255 = 1f / 255f;     // colour normalisation
		public const float SQRT2 = 1.41421356f;
		public const float INV_SQRT2 = 0.70710678f;   // 1/√2  - diagonal unit length
		public const float SQRT3 = 1.73205081f;
		public const float INV_SQRT3 = 0.57735027f;   // 1/√3  - cube-diagonal unit
		public const float GOLDEN_RATIO = 1.61803399f;   // useful for jitter / halton

		// -- Overflow-safety threshold for Normalize / Length / Distance -
		// sqrt(float.MaxValue) ≈ 1.8446e19. Any component whose magnitude
		// is below this threshold can be squared (x*x) without producing
		// +Infinity. We keep a comfortable margin below that ceiling so the
		// *sum* of three squared components (x²+y²+z²) also stays finite.
		//
		// Below this threshold, Normalize/Length skip an extra division on
		// the hot path (typical unit-ish game vectors). Above it, they
		// pre-scale by the largest component first - see SquareRootScalar.cs.
		// This matters in practice for large-world-space coordinates
		// (e.g. orbital/celestial positions far from the origin), where
		// squaring the raw components can silently overflow to Infinity
		// and quietly turn every downstream Normalize() into NaN.
		public const float SAFE_SQUARE_THRESHOLD = 1e17f;

		#endregion

		#region Sign-bit mask (IEEE-754 single precision)

		// Casting through unsafe pointer is the canonical branchless abs/sign trick.
		// Stored as int constant so the compiler embeds it as an immediate operand.
		internal const int SIGN_BIT_MASK = unchecked((int)0x80000000);
		internal const int ABS_MASK = 0x7FFFFFFF;

		#endregion
	}
}
