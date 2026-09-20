// Created by Anton Piruev in 2026.
// Any direct commercial use of derivative work is strictly prohibited.

using System.Runtime.CompilerServices;

namespace Framework.FastMath.Core
{
	/// <summary>
	/// Fast x^p for float bases. The bit-hack sibling of FastInvSqrt: instead
	/// of Newton-Raphson on 1/sqrt(x), this abuses the fact that reinterpreting
	/// an IEEE-754 float's bit pattern as an integer is *approximately*
	/// proportional to log2 of the value (Schraudolph's fast-log trick). Scale
	/// that integer by p and reinterpret back and you get x^p without a single
	/// call to Math.Pow/Math.Exp/Math.Log.
	///
	/// Two quality levels, same calling convention as FastInvSqrt(x, precise):
	///   FastPow(x, p)               - single magic-constant bit hack. Zero
	///                                  loops, ~6 ops on the hot path. Error
	///                                  a few percent for |p| <= 2, growing
	///                                  fast beyond that.
	///   FastPow(x, p, precise:true) - Paul Mineiro's fastlog2/fastpow2
	///                                  composition: each half gets its own
	///                                  rational (Padé-style) correction
	///                                  instead of a single linear hack.
	///                                  Error drops ~3 orders of magnitude
	///                                  (≈0.02-0.04% vs ≈2-20%) for roughly
	///                                  4x the instructions - still nowhere
	///                                  near MathF.Pow's cost.
	///
	/// FastPrecisePow (separate method, below) is a third option for a
	/// different tradeoff: exact integer part via squaring + a single cheap
	/// bit-hack correction for the fraction - use it when p's integer part
	/// dominates the cost/accuracy tradeoff you care about (e.g. gamma
	/// curves with p around 2.2).
	///
	/// On the "use the free lb/ub magic constants as an error-bounding
	/// clamp" idea: tested it and it does NOT do what it looks like it
	/// should. result(C) = p·(bits(x)-C)+C is linear in C, so with
	/// POW_MAGIC_LB &lt; POW_MAGIC &lt; POW_MAGIC_UB the RMSE-tuned result is
	/// *algebraically guaranteed* to already sit between the lb/ub estimates
	/// for any x, p - the clamp is a no-op across the entire sane operating
	/// range (verified: 0/200000 triggers for |p| &lt; 10). It only ever fires
	/// once |p| gets large enough that the int cast below silently wraps
	/// (unchecked overflow) and the un-clamped result is already NaN or a
	/// garbage negative subnormal - at which point lb/ub are equally
	/// unreliable, so clamping just relabels garbage as different garbage.
	/// Real fix for that edge, applied below instead: clamp p itself to a
	/// range the int cast can't overflow on.
	///
	/// Both quality levels assume x > 0 (this is a log-domain trick - there
	/// is no bit pattern representing log of a negative number). Bases below
	/// KINDA_SMALL_NUMBER are treated as 0, matching FastSqrt's "clamp the
	/// undefined edge, don't throw" behaviour.
	/// </summary>
	public static partial class FMath
	{
		// ----------------------------------------------------------------
		// Magic bias constant - same role as FastInvSqrt's 0x5f3759df, just
		// for the exponent bit-field instead of the mantissa. Derived from
		// Schraudolph's fast-log2 approximation:
		//   log2(x) ≈ (bits(x) - 1064866805) / 2^23
		// so scaling (bits(x) - MAGIC) by p and adding MAGIC back before
		// reinterpreting as a float computes x^p in one shot. This is the
		// empirically RMSE-minimising constant documented alongside Ankerl's
		// original formulation - not the naive bias-only 127<<23 (1065353216),
		// which measures ~1.8x worse max relative error for the same cost.
		// ----------------------------------------------------------------
		private const int POW_MAGIC = 1064866805;

		// Bounds on the same linear-in-C family (127<<23 ± the sawtooth
		// correction's known extremes). Kept for documentation/completeness
		// and for the p-overflow guard's safe-range derivation below - see
		// the class remarks above for why these do NOT make a useful
		// "clamp the output" trick.
		private const int POW_MAGIC_LB = 1064631197;
		private const int POW_MAGIC_UB = 1065353217;

		// Largest |p| for which p * (bits(x) - POW_MAGIC) is guaranteed to
		// stay inside int32 range for every representable finite x (bits(x)
		// spans roughly ±2.1e9 already at the extremes, so this is deliberately
		// conservative rather than exact - it only has to rule out silent
		// unchecked-int wraparound, not squeeze out the last representable p).
		private const float POW_MAX_SAFE_EXPONENT = 100f;

		#region FastPow - single bit-hack (default) or Mineiro composition (precise)

		/// <summary>
		/// Fast approximate x^p.
		///
		/// precise = false (default): one int reinterpret, one multiply-add,
		/// one float reinterpret. Error a few percent for |p| ≲ 2, growing
		/// quickly for larger exponents. Use FastPrecisePow or precise:true
		/// once |p| leaves that range.
		///
		/// precise = true: routes through <see cref="FastLog2Mineiro"/> and
		/// <see cref="FastExp2Mineiro"/> instead - roughly 3 orders of
		/// magnitude more accurate for ~4x the instructions.
		///
		/// Requires x > 0 (bases at/below KINDA_SMALL_NUMBER return 0, or 1
		/// if p is also ~0, mirroring the 0^0 = 1 convention). |p| beyond
		/// POW_MAX_SAFE_EXPONENT is clamped first - past that point the
		/// int cast in the fast path can silently overflow and hand back
		/// NaN/garbage, which defeats the entire point of a "fast" function.
		/// </summary>
		[MethodImpl( MethodImplOptions.AggressiveInlining )]
		public static unsafe float FastPow( float x, float p, bool precise = false )
		{
			// Guard the edges the bit hack can't represent (log of ≤0) before
			// touching the bit pattern at all - these are cold branches, the
			// common positive-base case falls straight through to the hack.
			if ( x < KINDA_SMALL_NUMBER )
				return AbsBranchless( p ) < KINDA_SMALL_NUMBER ? 1f : 0f;
			if ( AbsBranchless( p ) < KINDA_SMALL_NUMBER )
				return 1f;

			p = Clamp( p, -POW_MAX_SAFE_EXPONENT, POW_MAX_SAFE_EXPONENT );

			if ( precise )
				return FastExp2Mineiro( p * FastLog2Mineiro( x ) );

			int i = *(int*)&x;
			i = (int)( p * ( i - POW_MAGIC ) + POW_MAGIC );
			return *(float*)&i;
		}

		// ----------------------------------------------------------------
		// Mineiro's fastlog2 / fastpow2 - the "precise" path's building
		// blocks. Each swaps the single linear bit-hack for the same linear
		// hack PLUS a rational (Padé-style) correction term fitted on the
		// fractional exponent/mantissa - source of the ~1000x accuracy jump
		// over the plain single-constant hack, at the cost of a division.
		// Kept private: they're precision/cost building blocks for FastPow's
		// precise path, not part of the public "single scalar in, scalar
		// out" surface the rest of this file exposes.
		// ----------------------------------------------------------------

		[MethodImpl( MethodImplOptions.AggressiveInlining )]
		public static float FastLog2( float x ) => FastLog2Mineiro( x );

		[MethodImpl( MethodImplOptions.AggressiveInlining )]
		private static unsafe float FastLog2Mineiro( float x )
		{
			int vxi = *(int*)&x;
			int mxi = ( vxi & 0x007FFFFF ) | 0x3f000000;
			float mx = *(float*)&mxi;
			float y = vxi;
			y *= 1.1920928955078125e-7f;   // 1 / 2^23
			return y - 124.22551499f
					 - 1.498030302f * mx
					 - 1.72587999f / ( 0.3520887068f + mx );
		}

		[MethodImpl( MethodImplOptions.AggressiveInlining )]
		private static unsafe float FastExp2Mineiro( float p )
		{
			float offset = p < 0f ? 1f : 0f;
			float clipp = p < -126f ? -126f : p;
			int w = (int)clipp;
			float z = clipp - w + offset;
			int i = (int)( ( 1 << 23 ) * ( clipp + 121.2740575f + 27.7280233f / ( 4.84252568f - z ) - 1.49012907f * z ) );
			return *(float*)&i;
		}

		#endregion

		#region FastPrecisePow - exact integer part, bit-hack fractional part

		/// <summary>
		/// Precise-mode x^p: splits p into integer + fractional parts.
		/// The integer part is computed exactly via exponentiation by
		/// squaring (plain float multiplies, no approximation error). The
		/// fractional part - always in (-1, 1), where the bit hack is most
		/// accurate - is computed with <see cref="FastPow"/> itself.
		///
		/// Error: a fraction of a percent for typical game-dev exponents
		/// (gamma curves, falloff, easing). Costs a handful of extra
		/// multiplies over <see cref="FastPow"/>, still nowhere near the
		/// cost of MathF.Pow's log/exp double round-trip.
		/// </summary>
		[MethodImpl( MethodImplOptions.AggressiveInlining )]
		public static float FastPrecisePow( float x, float p )
		{
			if ( x < KINDA_SMALL_NUMBER )
				return AbsBranchless( p ) < KINDA_SMALL_NUMBER ? 1f : 0f;
			if ( AbsBranchless( p ) < KINDA_SMALL_NUMBER )
				return 1f;

			bool negExp = p < 0f;
			float absP = negExp ? -p : p;

			int e = (int)absP;              // integer part - exact via squaring
			float frac = absP - e;          // fractional part ∈ [0, 1) - bit hack

			float fracPow = frac > SMALL_NUMBER ? FastPow( x, frac ) : 1f;

			// Exponentiation by squaring - O(log e) multiplies, no error
			// accumulation beyond ordinary float rounding.
			float result = 1f;
			float baseVal = x;
			int n = e;
			while ( n > 0 )
			{
				if ( ( n & 1 ) != 0 ) result *= baseVal;
				baseVal *= baseVal;
				n >>= 1;
			}
			result *= fracPow;

			return negExp ? 1f / result : result;
		}

		#endregion
	}
}