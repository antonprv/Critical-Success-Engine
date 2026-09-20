// Created by Anton Piruev in 2026.
// Any direct commercial use of derivative work is strictly prohibited.


using System.Numerics;
using System.Runtime.CompilerServices;

using static Framework.FastMath.Core.FMath;

namespace Framework.FastMath.Numerics
{
	public static partial class FMath
	{
		// Below this dot product slerp falls back to cheap nlerp (angle < ~1.8°)
		private const float SLERP_DOT_THRESHOLD = 0.9995f;

		#region Dot / Length

		/// <summary>Quaternion dot product (= cosine of half-angle between rotations).</summary>
		[MethodImpl( MethodImplOptions.AggressiveInlining )]
		public static float Dot( in Quaternion a, in Quaternion b )
			=> a.X * b.X + a.Y * b.Y + a.Z * b.Z + a.W * b.W;

		/// <summary>Squared length - free comparison (no sqrt).</summary>
		[MethodImpl( MethodImplOptions.AggressiveInlining )]
		public static float LengthSq( in Quaternion q )
			=> q.X * q.X + q.Y * q.Y + q.Z * q.Z + q.W * q.W;

		/// <summary>
		/// Quaternion length via FastInvSqrt.
		/// |q| = sq · (1/√sq) - one Newton-Raphson, no division.
		/// Overflow-safe: see remarks on <see cref="Normalize(ref Quaternion, float)"/>.
		/// </summary>
		[MethodImpl( MethodImplOptions.AggressiveInlining )]
		public static float QuatLength( in Quaternion q )
		{
			float scale = SafeScaleFor( AbsBranchless( q.X ), AbsBranchless( q.Y ),
									   AbsBranchless( q.Z ), AbsBranchless( q.W ) );
			float sx = q.X * scale, sy = q.Y * scale, sz = q.Z * scale, sw = q.W * scale;
			float sq = sx * sx + sy * sy + sz * sz + sw * sw;
			return ( sq * FastInvSqrt( sq ) ) / scale;
		}

		#endregion

		#region In-place normalize

		/// <summary>
		/// Normalizes <paramref name="q"/> in-place using FastInvSqrt.
		/// Writes back through the ref - zero copies, zero heap allocation.
		///
		/// Overflow-safe: quaternions are almost always near-unit length in
		/// practice, but Normalize/Inverse are public API that can receive
		/// arbitrary caller input, so we apply the same largest-component
		/// pre-scaling used for Vector2/Vector3 in SquareRoot.cs rather than
		/// assuming the input is well-behaved.
		/// </summary>
		[MethodImpl( MethodImplOptions.AggressiveInlining )]
		public static void Normalize( ref Quaternion q, float epsilon = SMALL_NUMBER )
		{
			float scale = SafeScaleFor( AbsBranchless( q.X ), AbsBranchless( q.Y ),
									   AbsBranchless( q.Z ), AbsBranchless( q.W ) );
			float sx = q.X * scale, sy = q.Y * scale, sz = q.Z * scale, sw = q.W * scale;
			float sq = sx * sx + sy * sy + sz * sz + sw * sw;
			if ( sq < epsilon ) { q = Quaternion.Identity; return; }
			float inv = FastInvSqrt( sq );
			q.X = sx * inv; q.Y = sy * inv; q.Z = sz * inv; q.W = sw * inv;
		}

		/// <summary>
		/// Returns a new normalized quaternion using FastInvSqrt.
		/// Overflow-safe (see <see cref="Normalize(ref Quaternion, float)"/>).
		/// </summary>
		[MethodImpl( MethodImplOptions.AggressiveInlining )]
		public static Quaternion Normalized( in Quaternion q, float epsilon = SMALL_NUMBER )
		{
			float scale = SafeScaleFor( AbsBranchless( q.X ), AbsBranchless( q.Y ),
									   AbsBranchless( q.Z ), AbsBranchless( q.W ) );
			float sx = q.X * scale, sy = q.Y * scale, sz = q.Z * scale, sw = q.W * scale;
			float sq = sx * sx + sy * sy + sz * sz + sw * sw;
			if ( sq < epsilon ) return Quaternion.Identity;
			float inv = FastInvSqrt( sq );
			return new Quaternion( sx * inv, sy * inv, sz * inv, sw * inv );
		}

		#endregion

		#region Conjugate / Inverse

		/// <summary>
		/// Conjugate of q: (−x, −y, −z, w).
		/// For unit quaternions this equals the inverse and is essentially free.
		/// </summary>
		[MethodImpl( MethodImplOptions.AggressiveInlining )]
		public static Quaternion Conjugate( in Quaternion q )
			=> new Quaternion( -q.X, -q.Y, -q.Z, q.W );

		/// <summary>
		/// True quaternion inverse, valid for non-unit quaternions.
		///
		/// Hack: 1/|q|² ≈ FastInvSqrt(|q|²)² - squaring the inv-sqrt result
		/// gives the reciprocal in two cheap ops (one Newton-Raphson + one mul)
		/// instead of a full division. Overflow-safe pre-scaling applied first
		/// (see <see cref="Normalize(ref Quaternion, float)"/> remarks).
		/// </summary>
		[MethodImpl( MethodImplOptions.AggressiveInlining )]
		public static Quaternion Inverse( in Quaternion q )
		{
			float scale = SafeScaleFor( AbsBranchless( q.X ), AbsBranchless( q.Y ),
									   AbsBranchless( q.Z ), AbsBranchless( q.W ) );
			float sx = q.X * scale, sy = q.Y * scale, sz = q.Z * scale, sw = q.W * scale;
			float sq = sx * sx + sy * sy + sz * sz + sw * sw;
			if ( sq < SMALL_NUMBER ) return Quaternion.Identity;
			float invSqrt = FastInvSqrt( sq );
			// invSq is 1/(scale²·|q|²); multiply by scale² to undo the pre-scale
			// and recover the true 1/|q|².
			float invSq = invSqrt * invSqrt * scale * scale;
			return new Quaternion( -q.X * invSq, -q.Y * invSq, -q.Z * invSq, q.W * invSq );
		}

		#endregion

		#region Multiplication (Hamilton product)

		/// <summary>
		/// Hamilton product: 16 muls + 12 adds, no allocation.
		/// Apply as: Multiply(rotation, point_quat) to rotate a point.
		/// </summary>
		[MethodImpl( MethodImplOptions.AggressiveInlining )]
		public static Quaternion Multiply( in Quaternion a, in Quaternion b )
			=> new Quaternion(
				 a.W * b.X + a.X * b.W + a.Y * b.Z - a.Z * b.Y,
				 a.W * b.Y - a.X * b.Z + a.Y * b.W + a.Z * b.X,
				 a.W * b.Z + a.X * b.Y - a.Y * b.X + a.Z * b.W,
				 a.W * b.W - a.X * b.X - a.Y * b.Y - a.Z * b.Z );

		#endregion

		#region Vector rotation (Rodrigues' formula - avoids full quat multiply)

		/// <summary>
		/// Rotates a Vector3 by a unit quaternion using Rodrigues' formula.
		///
		/// v' = v + 2w(t × v) + 2(t × (t × v))  where t = q.xyz
		///
		/// 15 muls + 12 adds - cheaper than two Hamilton products (28 muls + 20 adds).
		/// Zero allocations - Vector3 is a Godot value type.
		/// </summary>
		[MethodImpl( MethodImplOptions.AggressiveInlining )]
		public static Vector3 Rotate( in Quaternion q, in Vector3 v )
		{
			float tx = 2f * ( q.Y * v.Z - q.Z * v.Y );
			float ty = 2f * ( q.Z * v.X - q.X * v.Z );
			float tz = 2f * ( q.X * v.Y - q.Y * v.X );
			return new Vector3(
				v.X + q.W * tx + q.Y * tz - q.Z * ty,
				v.Y + q.W * ty + q.Z * tx - q.X * tz,
				v.Z + q.W * tz + q.X * ty - q.Y * tx );
		}

		/// <summary>
		/// Rotates a Vector3 by the inverse of a unit quaternion.
		/// Equivalent to Rotate(Conjugate(q), v) but without a temporary.
		/// </summary>
		[MethodImpl( MethodImplOptions.AggressiveInlining )]
		public static Vector3 InverseRotate( in Quaternion q, in Vector3 v )
		{
			float tx = 2f * ( q.Z * v.Y - q.Y * v.Z );
			float ty = 2f * ( q.X * v.Z - q.Z * v.X );
			float tz = 2f * ( q.Y * v.X - q.X * v.Y );
			return new Vector3(
				v.X + q.W * tx + q.Z * ty - q.Y * tz,
				v.Y + q.W * ty + q.X * tz - q.Z * tx,
				v.Z + q.W * tz + q.Y * tx - q.X * ty );
		}

		#endregion

		#region FromAxisAngle

		/// <summary>
		/// Creates a quaternion from a unit axis and an angle in radians.
		///
		/// q = (axis · sin(angle/2), cos(angle/2))
		///
		/// Hack: uses FastSin + FastCos polynomials instead of MathF.Sin/Cos.
		/// Both are evaluated from the same half-angle - zero extra trig calls.
		/// The axis must be unit length; call with Normalized(axis) if unsure.
		///
		/// Uses the SAFE (range-reduced) FastSin/FastCos, not the Unsafe fast
		/// path: <paramref name="angle"/> is caller-supplied and can be any
		/// finite value (e.g. an accumulated rotation), so half is not
		/// guaranteed to stay inside [-π/2, π/2].
		/// </summary>
		[MethodImpl( MethodImplOptions.AggressiveInlining )]
		public static Quaternion FromAxisAngle( in Vector3 axis, float angle )
		{
			float half = angle * 0.5f;
			float sinHalf = FastSin( half );
			float cosHalf = FastCos( half );
			return new Quaternion( axis.X * sinHalf, axis.Y * sinHalf,
								  axis.Z * sinHalf, cosHalf );
		}

		#endregion

		#region ToAxisAngle

		/// <summary>
		/// Extracts the rotation axis and angle (radians) from a unit quaternion.
		///
		/// Hack: uses FastInvSqrt to recover sin(ω/2) and then scale the axis -
		/// avoids Math.Acos and Math.Sqrt, replaced by FastAtan2 + FastInvSqrt.
		/// </summary>
		[MethodImpl( MethodImplOptions.AggressiveInlining )]
		public static void ToAxisAngle( in Quaternion q, out Vector3 axis, out float angle )
		{
			float sinSq = q.X * q.X + q.Y * q.Y + q.Z * q.Z;
			if ( sinSq < SMALL_NUMBER )
			{
				axis = new Vector3( 1f, 0f, 0f );
				angle = 0f;
				return;
			}
			float invSin = FastInvSqrt( sinSq );
			float sinVal = sinSq * invSin;              // sqrt(sinSq) - no extra call
														// angle = 2 * atan2(sin(ω/2), cos(ω/2))
			angle = 2f * FastAtan2( sinVal, q.W, precise: true );
			axis = new Vector3( q.X * invSin, q.Y * invSin, q.Z * invSin );
		}

		#endregion

		#region Angle between two rotations

		/// <summary>
		/// Full rotation angle (radians) between two unit quaternions.
		///
		/// Hack: acos(d) = atan2(√(1−d²), d) - avoids Math.Acos entirely.
		/// Uses FastAtan2 (polynomial) + the sinSq trick:
		///   sinOmega = sinSq · FastInvSqrt(sinSq)  ← sqrt from one inv-sqrt call.
		/// </summary>
		[MethodImpl( MethodImplOptions.AggressiveInlining )]
		public static float AngleBetween( in Quaternion a, in Quaternion b )
		{
			float dot = Dot( a, b );
			if ( dot < 0f ) dot = -dot;
			if ( dot >= 1f ) return 0f;
			float sinSq = 1f - dot * dot;
			if ( sinSq < SMALL_NUMBER ) return 0f;
			float invSin = FastInvSqrt( sinSq );
			float sinOmega = sinSq * invSin;           // sqrt(sinSq) - no second sqrt
			return 2f * FastAtan2( sinOmega, dot, precise: true );
		}

		#endregion

		#region Nlerp

		/// <summary>
		/// Normalized linear interpolation between unit quaternions.
		/// Constant-speed only for small angles, but zero trig ops.
		/// </summary>
		[MethodImpl( MethodImplOptions.AggressiveInlining )]
		public static Quaternion Nlerp( in Quaternion a, in Quaternion b, float t )
		{
			t = Clamp01( t );
			float dot = Dot( a, b );
			// Shortest path: flip b if dot < 0 - compiles to CMOV (no branch penalty)
			float bx = dot < 0f ? -b.X : b.X;
			float by = dot < 0f ? -b.Y : b.Y;
			float bz = dot < 0f ? -b.Z : b.Z;
			float bw = dot < 0f ? -b.W : b.W;
			float mt = 1f - t;
			Quaternion r = new Quaternion( mt * a.X + t * bx,
										  mt * a.Y + t * by,
										  mt * a.Z + t * bz,
										  mt * a.W + t * bw );
			Normalize( ref r );
			return r;
		}

		#endregion

		#region FastSlerp

		/// <summary>
		/// Spherical linear interpolation between two unit quaternions.
		///
		/// Full hack pipeline:
		///   1. Early-out for t=0 / t=1                        - 0 math ops
		///   2. Nlerp shortcut when dot > 0.9995               - 0 trig ops
		///   3. FastInvSqrt(sinSq) → both 1/sin(ω) AND sin(ω) - 1 Newton-Raphson
		///   4. FastAtan2 polynomial for ω = acos(dot)         - ~12 float ops
		///   5. FastSinUnsafe polynomial for sin((1-t)ω), sin(tω) - ~4 float ops each
		///
		/// Total trig cost: 0 standard library calls.
		///
		/// Uses FastSinUnsafe (no range reduction) rather than the safe FastSin:
		/// dot is forced non-negative a few lines above, so sinOmega ≥ 0 too,
		/// which means omega = FastAtan2(sinOmega, dot) is provably confined to
		/// [0, π/2] (atan2 of two non-negative arguments never leaves the first
		/// quadrant). Both (1-t)·omega and t·omega (t ∈ [0,1]) are therefore
		/// always ≤ omega ≤ π/2 - inside FastSinUnsafe's valid domain by
		/// construction, so the cheaper/faster variant is safe here.
		/// </summary>
		[MethodImpl( MethodImplOptions.AggressiveInlining )]
		public static Quaternion FastSlerp( in Quaternion a, in Quaternion b, float t )
		{
			if ( t <= 0f ) return a;
			if ( t >= 1f ) return b;

			float dot = Dot( a, b );

			float bx, by, bz, bw;
			if ( dot < 0f ) { dot = -dot; bx = -b.X; by = -b.Y; bz = -b.Z; bw = -b.W; }
			else { bx = b.X; by = b.Y; bz = b.Z; bw = b.W; }

			// Fast path: nearly identical quaternions (< ~1.8° apart)
			if ( dot > SLERP_DOT_THRESHOLD )
			{
				float mt = 1f - t;
				Quaternion r = new Quaternion( mt * a.X + t * bx, mt * a.Y + t * by,
											  mt * a.Z + t * bz, mt * a.W + t * bw );
				Normalize( ref r );
				return r;
			}

			float sinSq = 1f - dot * dot;
			float invSin = FastInvSqrt( sinSq );
			float sinOmega = sinSq * invSin;            // sqrt(sinSq) - no extra sqrt call
			float omega = FastAtan2( sinOmega, dot, precise: true );   // ∈ [0, π/2] - see remarks above
			float scale0 = FastSinUnsafe( ( 1f - t ) * omega ) * invSin;
			float scale1 = FastSinUnsafe( t * omega ) * invSin;

			return new Quaternion( scale0 * a.X + scale1 * bx,
								  scale0 * a.Y + scale1 * by,
								  scale0 * a.Z + scale1 * bz,
								  scale0 * a.W + scale1 * bw );
		}

		#endregion

		#region RotateTowards

		[MethodImpl( MethodImplOptions.AggressiveInlining )]
		public static Quaternion RotateTowards(
			in Quaternion from, in Quaternion to, float maxRadiansDelta )
		{
			float angle = AngleBetween( from, to );
			if ( angle < SMALL_NUMBER ) return to;
			return FastSlerp( from, to, Clamp01( maxRadiansDelta / angle ) );
		}

		#endregion

		#region Squad (Spherical Quadrangle interpolation)

		[MethodImpl( MethodImplOptions.AggressiveInlining )]
		public static Quaternion SquadTangent(
			in Quaternion prev, in Quaternion q, in Quaternion next )
		{
			Quaternion invQ = Conjugate( q );
			Quaternion q1 = Normalized( Multiply( invQ, next ) );
			Quaternion q2 = Normalized( Multiply( invQ, prev ) );
			Quaternion avgLog = Nlerp( q1, q2, 0.5f );
			Quaternion halfAvg = FastSlerp( Quaternion.Identity, avgLog, -0.25f );
			return Normalized( Multiply( q, halfAvg ) );
		}

		[MethodImpl( MethodImplOptions.AggressiveInlining )]
		public static Quaternion Squad(
			in Quaternion a, in Quaternion ta,
			in Quaternion tb, in Quaternion b, float t )
		{
			float innerT = 2f * t * ( 1f - t );
			return FastSlerp( FastSlerp( a, b, t ), FastSlerp( ta, tb, t ), innerT );
		}

		#endregion

		#region Exp / Log

		/// <summary>
		/// Uses the SAFE FastSin (range-reduced), not FastSinUnsafe:
		/// <paramref name="q"/> here represents a pure/imaginary quaternion
		/// (typically from Log(), but the function accepts any input), and its
		/// vector-part magnitude - hence <c>angle</c> and <c>halfAngle</c> below -
		/// is not provably bounded to [-π/2, π/2] the way FastSlerp's blend
		/// weights are. See FromAxisAngle remarks for the same reasoning.
		/// </summary>
		[MethodImpl( MethodImplOptions.AggressiveInlining )]
		public static Quaternion Exp( in Quaternion q )
		{
			float angle = FastSqrt( q.X * q.X + q.Y * q.Y + q.Z * q.Z );
			if ( angle < SMALL_NUMBER ) return Quaternion.Identity;
			float sinAngle = FastSin( angle );
			float sinOverAngle = sinAngle * FastInvSqrt( angle * angle );
			float halfAngle = angle * 0.5f;
			float sinHalf = FastSin( halfAngle );
			float cosAngle = 1f - 2f * sinHalf * sinHalf;
			return new Quaternion( q.X * sinOverAngle, q.Y * sinOverAngle,
								  q.Z * sinOverAngle, cosAngle );
		}

		[MethodImpl( MethodImplOptions.AggressiveInlining )]
		public static Quaternion Log( in Quaternion q )
		{
			float sinSq = q.X * q.X + q.Y * q.Y + q.Z * q.Z;
			if ( sinSq < SMALL_NUMBER ) return new Quaternion( 0f, 0f, 0f, 0f );
			float invSin = FastInvSqrt( sinSq );
			float sinOmega = sinSq * invSin;
			float omega = FastAtan2( sinOmega, q.W, precise: true );
			float omegaOverSin = omega * invSin;
			return new Quaternion( q.X * omegaOverSin, q.Y * omegaOverSin,
								  q.Z * omegaOverSin, 0f );
		}

		#endregion

		#region Look Rotation

		/// <summary>
		/// Creates a unit quaternion that rotates the forward direction
		/// to look toward <paramref name="forward"/> with the given <paramref name="up"/>.
		///
		/// Equivalent to Godot's Quaternion.LookingAt() but uses FastInvSqrt
		/// for every normalization step - no Math.Sqrt calls.
		///
		/// Both forward and up must be non-zero; forward should already be
		/// unit length for best accuracy (but the function handles non-unit input).
		/// </summary>
		[MethodImpl( MethodImplOptions.AggressiveInlining )]
		public static Quaternion LookRotation( in Vector3 forward, in Vector3 up )
		{
			// Orthonormal basis via Gram-Schmidt (all norms via FastInvSqrt)
			Vector3 f = Normalized( forward );
			Vector3 r = Normalized( Cross( up, f ) );       // right
			Vector3 u = Cross( f, r );                    // true up (already unit if f,r are)

			// Convert the (r, u, f) rotation matrix to a quaternion using
			// Shepperd's method: pick whichever of {trace, r.X, u.Y, f.Z} is
			// largest as the "pivot" term to take the square root of, since
			// that keeps the sqrt argument comfortably away from zero (the
			// usual single-formula approach divides by 4w and blows up
			// whenever w is small, i.e. near a 180° rotation).
			//
			// Standard identities used below, for w as the pivot (trace > 0):
			//   w = sqrt(trace + 1) / 2
			//   x = (u.Z - f.Y) / (4w),  y = (f.X - r.Z) / (4w),  z = (r.Y - u.X) / (4w)
			// and symmetric versions when x, y, or z is the pivot instead.
			float trace = r.X + u.Y + f.Z;
			if ( trace > 0f )
			{
				float sqrtT = ( trace + 1f ) * FastInvSqrt( trace + 1f );   // sqrt(trace+1)
				float w = sqrtT * 0.5f;
				float inv4w = 1f / ( 2f * sqrtT );                          // 1/(4w)
				return new Quaternion(
					( u.Z - f.Y ) * inv4w,
					( f.X - r.Z ) * inv4w,
					( r.Y - u.X ) * inv4w,
					w );
			}
			else if ( r.X > u.Y && r.X > f.Z )
			{
				float sqrtT = FastSqrt( 1f + r.X - u.Y - f.Z );
				float inv4x = 1f / ( 2f * sqrtT );
				return new Quaternion( sqrtT * 0.5f,
					( r.Y + u.X ) * inv4x, ( f.X + r.Z ) * inv4x, ( u.Z - f.Y ) * inv4x );
			}
			else if ( u.Y > f.Z )
			{
				float sqrtT = FastSqrt( 1f + u.Y - r.X - f.Z );
				float inv4y = 1f / ( 2f * sqrtT );
				return new Quaternion(
					( r.Y + u.X ) * inv4y, sqrtT * 0.5f,
					( u.Z + f.Y ) * inv4y, ( f.X - r.Z ) * inv4y );
			}
			else
			{
				float sqrtT = FastSqrt( 1f + f.Z - r.X - u.Y );
				float inv4z = 1f / ( 2f * sqrtT );
				return new Quaternion(
					( f.X + r.Z ) * inv4z, ( u.Z + f.Y ) * inv4z,
					sqrtT * 0.5f, ( r.Y - u.X ) * inv4z );
			}
		}

		#endregion

		#region IsIdentity - branchless check

		/// <summary>
		/// Returns true when q is approximately Identity (0,0,0,1).
		/// Uses IsNormalized pattern - squared comparison, no sqrt.
		/// </summary>
		[MethodImpl( MethodImplOptions.AggressiveInlining )]
		public static bool IsIdentity( in Quaternion q, float epsilon = KINDA_SMALL_NUMBER )
		{
			float dx = q.X, dy = q.Y, dz = q.Z, dw = q.W - 1f;
			return dx * dx + dy * dy + dz * dz + dw * dw < epsilon;
		}

		#endregion
	}
}
