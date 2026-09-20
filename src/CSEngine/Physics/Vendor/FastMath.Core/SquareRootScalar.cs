// Created by Anton Piruev in 2026. 
// Any direct commercial use of derivative work is strictly prohibited.

using System.Runtime.CompilerServices;

namespace Framework.FastMath.Core
{
	/// <summary>
	/// Fast square-root / inverse-square-root and the scalar-only helpers
	/// shared by both the Godot and Numerics vector/quaternion implementations.
	///
	/// This file intentionally contains NO Vector2/Vector3/Quaternion overloads -
	/// those are engine/library-specific and live (duplicated, not converted)
	/// in Framework.FastMath.Godot and Framework.FastMath.Numerics respectively,
	/// each calling straight back into these scalar primitives via
	/// `using static Framework.FastMath.Core.FMath;`. That keeps the hot vector
	/// math as plain static-method calls (aggressively inlined) with zero
	/// interface/adapter indirection, while still sharing the actual sqrt/trig
	/// arithmetic in one place.
	/// </summary>
	public static partial class FMath
	{
		// ----------------------------------------------------------------
		// FastInvSqrt - Quake III bit-hack  (the heart of the library)
		// ----------------------------------------------------------------

		/// <summary>
		/// Fast Inverse Square Root - Quake III Arena's algorithm, but with
		/// Jan Kadlec's exhaustively-searched magic constant AND matching
		/// Newton-Raphson coefficients, instead of the original 0x5f3759df +
		/// the textbook 1.5/0.5 Newton step.
		///
		/// Quake's version tunes the magic constant alone and bolts a generic
		/// Newton-Raphson iteration onto it. Kadlec's insight was that the
		/// magic constant and the iteration's coefficients both shape the
		/// final error, so searching them *together* beats tuning either one
		/// in isolation - the result cuts peak relative error by ~2.7x for
		/// the same two multiplies and one FMA-ish subtract as before.
		///
		/// Error after one tuned iteration:                ≈ 0.065%  (was ≈0.175% with Quake's constant)
		/// Error after the extra standard Newton-Raphson:   ≈ 0.000015% (precise mode, unchanged)
		///
		/// Original comment: "What the fuck?" - still applies.
		/// </summary>
		[MethodImpl( MethodImplOptions.AggressiveInlining )]
		public static unsafe float FastInvSqrt( float x, bool precise = false )
		{
			const int MAGIC = 0x5f1ffff9;
			int i = *(int*)&x;
			i = MAGIC - ( i >> 1 );
			float y = *(float*)&i;
			y = y * ( 0.703952253f * ( 2.38924456f - x * y * y ) );   // Kadlec's tuned Newton-Raphson #1
			if ( precise )
			{
				float xhalf = 0.5f * x;
				y = y * ( 1.5f - xhalf * y * y ); // standard Newton-Raphson #2 - squeezes further precision
			}
			return y;
		}

		// ----------------------------------------------------------------
		// FastSqrt
		// ----------------------------------------------------------------

		/// <summary>
		/// Fast square root: x · FastInvSqrt(x).
		/// One Newton-Raphson pass; error ≈ 0.175%.
		/// Returns 0 for x ≤ 0 (guards NaN propagation).
		/// </summary>
		[MethodImpl( MethodImplOptions.AggressiveInlining )]
		public static float FastSqrt( float x )
		{
			if ( x <= 0f ) return 0f;
			return x * FastInvSqrt( x );
		}

		// ----------------------------------------------------------------
		// Overflow-safe squared-length helper (shared by Normalize/Length
		// in both Godot/FastMath and Numerics/FastMath)
		// ----------------------------------------------------------------

		/// <summary>
		/// Computes the scale to pre-multiply components by, if any
		/// component's magnitude exceeds <see cref="SAFE_SQUARE_THRESHOLD"/>,
		/// to avoid x*x overflowing to +Infinity. Callers reconstruct the
		/// true result by dividing the scale back in (or, for Normalize, the
		/// scale cancels out entirely).
		///
		/// Public (was private in the original monolithic library) because
		/// the vector-specific Normalize/Length overloads that use this now
		/// live in a different assembly (Godot/FastMath, Numerics/FastMath).
		/// </summary>
		[MethodImpl( MethodImplOptions.AggressiveInlining )]
		public static float SafeScaleFor( float ax, float ay, float az )
		{
			float max = ax > ay ? ( ax > az ? ax : az ) : ( ay > az ? ay : az );
			return max > SAFE_SQUARE_THRESHOLD ? 1f / max : 1f;
		}

		/// <summary>4-component overload used by Quaternion Normalize/Inverse/Length.</summary>
		[MethodImpl( MethodImplOptions.AggressiveInlining )]
		public static float SafeScaleFor( float ax, float ay, float az, float aw )
		{
			float max = ax > ay ? ax : ay;
			float max2 = az > aw ? az : aw;
			max = max > max2 ? max : max2;
			return max > SAFE_SQUARE_THRESHOLD ? 1f / max : 1f;
		}

		[MethodImpl( MethodImplOptions.AggressiveInlining )]
		public static float SafeScaleFor( float ax, float ay )
		{
			float max = ax > ay ? ax : ay;
			return max > SAFE_SQUARE_THRESHOLD ? 1f / max : 1f;
		}

		// ----------------------------------------------------------------
		// Normalize (ref scalar components) - lowest-level overload
		// ----------------------------------------------------------------

		/// <summary>
		/// Fast 3-D normalization via a single FastInvSqrt call.
		/// Writes results back through refs - zero copies, zero allocation.
		/// Sets all components to 0 when length**2 &lt; epsilon.
		/// Overflow-safe for very large components (see class remarks).
		/// </summary>
		[MethodImpl( MethodImplOptions.AggressiveInlining )]
		public static void FastNormalize( ref float x, ref float y, ref float z,
										 float epsilon = SMALL_NUMBER )
		{
			float scale = SafeScaleFor( AbsBranchless( x ), AbsBranchless( y ), AbsBranchless( z ) );
			float sx = x * scale, sy = y * scale, sz = z * scale;
			float sq = sx * sx + sy * sy + sz * sz;
			if ( sq < epsilon ) { x = y = z = 0f; return; }
			float inv = FastInvSqrt( sq );
			x = sx * inv; y = sy * inv; z = sz * inv;
		}

		// ----------------------------------------------------------------
		// Scalar length / distance - no Vector type involved
		// ----------------------------------------------------------------

		/// <summary>
		/// Fast 3-D vector length. Overflow-safe for very large components.
		///
		/// Hack: length = sq · FastInvSqrt(sq) - gets sqrt from the same
		/// Newton-Raphson pass we'd need for normalize anyway.
		/// </summary>
		[MethodImpl( MethodImplOptions.AggressiveInlining )]
		public static float FastLength( float x, float y, float z,
									   float epsilon = SMALL_NUMBER )
		{
			float scale = SafeScaleFor( AbsBranchless( x ), AbsBranchless( y ), AbsBranchless( z ) );
			float sx = x * scale, sy = y * scale, sz = z * scale;
			float sq = sx * sx + sy * sy + sz * sz;
			if ( sq < epsilon ) return 0f;
			return ( sq * FastInvSqrt( sq ) ) / scale;   // undo the pre-scale
		}

		/// <summary>Fast 3-D distance via FastInvSqrt. Overflow-safe.</summary>
		[MethodImpl( MethodImplOptions.AggressiveInlining )]
		public static float FastDistance( float x1, float y1, float z1,
										 float x2, float y2, float z2 )
		{
			float dx = x2 - x1, dy = y2 - y1, dz = z2 - z1;
			return FastLength( dx, dy, dz );
		}

		/// <summary>
		/// Squared 3-D distance - zero sqrt, ideal for "closer than X" checks.
		/// Compare result against X*X instead of X. Not overflow-guarded -
		/// see the LengthSq remarks in Godot/Numerics SquareRoot.cs (comparisons
		/// are unaffected by overflow since +Infinity still compares as "far away").
		/// </summary>
		[MethodImpl( MethodImplOptions.AggressiveInlining )]
		public static float DistanceSquared( float x1, float y1, float z1,
											float x2, float y2, float z2 )
		{
			float dx = x2 - x1, dy = y2 - y1, dz = z2 - z1;
			return dx * dx + dy * dy + dz * dz;
		}

		// ----------------------------------------------------------------
		// Bit-manipulation helpers (private - shared across Core)
		// ----------------------------------------------------------------

		[MethodImpl( MethodImplOptions.AggressiveInlining )]
		private static unsafe int FloatToInt32Bits( float value ) => *(int*)&value;

		[MethodImpl( MethodImplOptions.AggressiveInlining )]
		private static unsafe float Int32BitsToFloat( int value ) => *(float*)&value;
	}
}