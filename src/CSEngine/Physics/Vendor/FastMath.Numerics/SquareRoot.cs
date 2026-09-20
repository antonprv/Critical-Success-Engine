// Created by Anton Piruev in 2026. 
// Any direct commercial use of derivative work is strictly prohibited.

using System.Numerics;
using System.Runtime.CompilerServices;
using static Framework.FastMath.Core.FMath;

namespace Framework.FastMath.Numerics
{
	// Fast square-root, inverse-square-root, length, normalization - for
	// Godot.Vector2 / Godot.Vector3 / Godot.Quaternion.
	public static partial class FMath
	{
		#region Vector3 - Normalize / Normalized / IsNormalized

		/// <summary>
		/// Normalizes <paramref name="v"/> in-place using FastInvSqrt.
		/// Mutates the original struct through the ref - zero allocation.
		/// Sets v to Vector3.Zero when its length is below epsilon.
		/// Overflow-safe: pre-scales by the largest component before
		/// squaring, so components beyond ~1e17 don't overflow to Infinity.
		/// </summary>
		[MethodImpl( MethodImplOptions.AggressiveInlining )]
		public static void Normalize( ref Vector3 v, float epsilon = SMALL_NUMBER )
		{
			float scale = SafeScaleFor( AbsBranchless( v.X ), AbsBranchless( v.Y ), AbsBranchless( v.Z ) );
			float sx = v.X * scale, sy = v.Y * scale, sz = v.Z * scale;
			float sq = sx * sx + sy * sy + sz * sz;
			if ( sq < epsilon ) { v = Vector3.Zero; return; }
			float inv = FastInvSqrt( sq );
			v.X = sx * inv; v.Y = sy * inv; v.Z = sz * inv;
		}

		/// <summary>
		/// Returns a new normalized Vector3 using FastInvSqrt.
		/// The original vector is not modified.
		/// Returns Vector3.Zero when length is below epsilon.
		/// Overflow-safe (see <see cref="Normalize(ref Vector3, float)"/>).
		/// </summary>
		[MethodImpl( MethodImplOptions.AggressiveInlining )]
		public static Vector3 Normalized( in Vector3 v, float epsilon = SMALL_NUMBER )
		{
			float scale = SafeScaleFor( AbsBranchless( v.X ), AbsBranchless( v.Y ), AbsBranchless( v.Z ) );
			float sx = v.X * scale, sy = v.Y * scale, sz = v.Z * scale;
			float sq = sx * sx + sy * sy + sz * sz;
			if ( sq < epsilon ) return Vector3.Zero;
			float inv = FastInvSqrt( sq );
			return new Vector3( sx * inv, sy * inv, sz * inv );
		}

		/// <summary>
		/// Returns true when |v|² is within epsilon of 1.
		///
		/// Hack: compares squared length against [1-ε, 1+ε] - no sqrt needed.
		/// Useful to assert invariants on hot paths without paying sqrt cost.
		/// Not pre-scaled: a vector whose squared length is near 1 can never
		/// be large enough to risk overflow, so the extra work is unnecessary.
		/// </summary>
		[MethodImpl( MethodImplOptions.AggressiveInlining )]
		public static bool IsNormalized( in Vector3 v, float epsilon = KINDA_SMALL_NUMBER )
		{
			float sq = v.X * v.X + v.Y * v.Y + v.Z * v.Z;
			// |sq - 1| < ε  ↔  sq ∈ (1-ε, 1+ε)
			float d = sq - 1f;
			return d > -epsilon & d < epsilon;   // bitwise & avoids branch
		}

		#endregion

		#region Vector2 - Normalize / Normalized / IsNormalized

		/// <summary>
		/// Normalizes a Vector2 in-place using FastInvSqrt.
		/// Writes back through ref - zero allocation.
		/// Sets v to Vector2.Zero when length is below epsilon.
		/// Overflow-safe (see Vector3 overload remarks).
		/// </summary>
		[MethodImpl( MethodImplOptions.AggressiveInlining )]
		public static void Normalize( ref Vector2 v, float epsilon = SMALL_NUMBER )
		{
			float scale = SafeScaleFor( AbsBranchless( v.X ), AbsBranchless( v.Y ) );
			float sx = v.X * scale, sy = v.Y * scale;
			float sq = sx * sx + sy * sy;
			if ( sq < epsilon ) { v = Vector2.Zero; return; }
			float inv = FastInvSqrt( sq );
			v.X = sx * inv; v.Y = sy * inv;
		}

		/// <summary>
		/// Returns a new normalized Vector2 using FastInvSqrt.
		/// Returns Vector2.Zero when length is below epsilon.
		/// Overflow-safe (see Vector3 overload remarks).
		/// </summary>
		[MethodImpl( MethodImplOptions.AggressiveInlining )]
		public static Vector2 Normalized( in Vector2 v, float epsilon = SMALL_NUMBER )
		{
			float scale = SafeScaleFor( AbsBranchless( v.X ), AbsBranchless( v.Y ) );
			float sx = v.X * scale, sy = v.Y * scale;
			float sq = sx * sx + sy * sy;
			if ( sq < epsilon ) return Vector2.Zero;
			float inv = FastInvSqrt( sq );
			return new Vector2( sx * inv, sy * inv );
		}

		/// <summary>
		/// Returns true when |v|² is within epsilon of 1 (no sqrt).
		/// </summary>
		[MethodImpl( MethodImplOptions.AggressiveInlining )]
		public static bool IsNormalized( in Vector2 v, float epsilon = KINDA_SMALL_NUMBER )
		{
			float sq = v.X * v.X + v.Y * v.Y;
			float d = sq - 1f;
			return d > -epsilon & d < epsilon;
		}

		#endregion

		// Normalize itself lives in FastQuaternion.cs
		#region Quaternion.IsNormalized

		/// <summary>
		/// Returns true when |q|² is within epsilon of 1 (no sqrt).
		/// </summary>
		[MethodImpl( MethodImplOptions.AggressiveInlining )]
		public static bool IsNormalized( in Quaternion q, float epsilon = KINDA_SMALL_NUMBER )
		{
			float sq = q.X * q.X + q.Y * q.Y + q.Z * q.Z + q.W * q.W;
			float d = sq - 1f;
			return d > -epsilon & d < epsilon;
		}

		#endregion

		#region Length helpers

		/// <summary>Fast 3-D length of a Godot Vector3. Overflow-safe.</summary>
		[MethodImpl( MethodImplOptions.AggressiveInlining )]
		public static float FastLength( in Vector3 v )
		{
			float scale = SafeScaleFor( AbsBranchless( v.X ), AbsBranchless( v.Y ), AbsBranchless( v.Z ) );
			float sx = v.X * scale, sy = v.Y * scale, sz = v.Z * scale;
			float sq = sx * sx + sy * sy + sz * sz;
			if ( sq < SMALL_NUMBER ) return 0f;
			return ( sq * FastInvSqrt( sq ) ) / scale;
		}

		/// <summary>
		/// Fast 2-D length. Overflow-safe.
		/// One fewer multiply than the 3-D path - worth a separate overload
		/// when processing thousands of 2-D vectors per frame.
		/// </summary>
		[MethodImpl( MethodImplOptions.AggressiveInlining )]
		public static float FastLength( in Vector2 v )
		{
			float scale = SafeScaleFor( AbsBranchless( v.X ), AbsBranchless( v.Y ) );
			float sx = v.X * scale, sy = v.Y * scale;
			float sq = sx * sx + sy * sy;
			if ( sq < SMALL_NUMBER ) return 0f;
			return ( sq * FastInvSqrt( sq ) ) / scale;
		}

		#endregion


		// Deliberately NOT overflow-guarded: these exist specifically for
		// cheap comparisons ("is A closer than B"), where an overflowed
		// +Infinity still compares correctly as "very far away". Guarding
		// them would add cost to the hottest, most-called functions in the
		// library for a case that doesn't change the comparison outcome.
		// Use FastLength (guarded) if you need the actual numeric value.
		#region LengthSq helpers - cheapest possible magnitude check

		/// <summary>Squared length of a Vector3 - no sqrt, use for comparisons.</summary>
		[MethodImpl( MethodImplOptions.AggressiveInlining )]
		public static float LengthSq( in Vector3 v )
			=> v.X * v.X + v.Y * v.Y + v.Z * v.Z;

		/// <summary>Squared length of a Vector2.</summary>
		[MethodImpl( MethodImplOptions.AggressiveInlining )]
		public static float LengthSq( in Vector2 v )
			=> v.X * v.X + v.Y * v.Y;

		#endregion

		#region Distance helpers

		/// <summary>Fast 3-D distance between two Vector3 points. Overflow-safe.</summary>
		[MethodImpl( MethodImplOptions.AggressiveInlining )]
		public static float FastDistance( in Vector3 a, in Vector3 b )
		{
			float dx = b.X - a.X, dy = b.Y - a.Y, dz = b.Z - a.Z;
			return FastLength( dx, dy, dz );
		}

		/// <summary>Fast 2-D distance between two Vector2 points. Overflow-safe.</summary>
		[MethodImpl( MethodImplOptions.AggressiveInlining )]
		public static float FastDistance( in Vector2 a, in Vector2 b )
		{
			float dx = b.X - a.X, dy = b.Y - a.Y;
			return FastLength( new Vector2( dx, dy ) );
		}

		/// <summary>Squared 3-D distance between two Vector3 points.</summary>
		[MethodImpl( MethodImplOptions.AggressiveInlining )]
		public static float DistanceSquared( in Vector3 a, in Vector3 b )
		{
			float dx = b.X - a.X, dy = b.Y - a.Y, dz = b.Z - a.Z;
			return dx * dx + dy * dy + dz * dz;
		}

		/// <summary>Squared 2-D distance between two Vector2 points.</summary>
		[MethodImpl( MethodImplOptions.AggressiveInlining )]
		public static float DistanceSquared( in Vector2 a, in Vector2 b )
		{
			float dx = b.X - a.X, dy = b.Y - a.Y;
			return dx * dx + dy * dy;
		}

		#endregion

		#region Dot products (Vector2 / Vector3)

		/// <summary>3-D dot product - no division, no sqrt, purely additive.</summary>
		[MethodImpl( MethodImplOptions.AggressiveInlining )]
		public static float Dot( in Vector3 a, in Vector3 b )
			=> a.X * b.X + a.Y * b.Y + a.Z * b.Z;

		/// <summary>2-D dot product.</summary>
		[MethodImpl( MethodImplOptions.AggressiveInlining )]
		public static float Dot( in Vector2 a, in Vector2 b )
			=> a.X * b.X + a.Y * b.Y;

		/// <summary>
		/// 2-D perpendicular (perp) dot product - equivalent to the Z component
		/// of the 3-D cross product: a.X·b.Y − a.Y·b.X.
		/// Sign tells you left/right of the vector; magnitude = |a||b|sin θ.
		/// </summary>
		[MethodImpl( MethodImplOptions.AggressiveInlining )]
		public static float PerpDot( in Vector2 a, in Vector2 b )
			=> a.X * b.Y - a.Y * b.X;

		/// <summary>3-D cross product. Result is perpendicular to both a and b.</summary>
		[MethodImpl( MethodImplOptions.AggressiveInlining )]
		public static Vector3 Cross( in Vector3 a, in Vector3 b )
			=> new Vector3(
				a.Y * b.Z - a.Z * b.Y,
				a.Z * b.X - a.X * b.Z,
				a.X * b.Y - a.Y * b.X );

		#endregion

		#region Reflect / Project - built on Dot, no stdlib calls

		/// <summary>
		/// Reflects vector <paramref name="v"/> about normal <paramref name="n"/>
		/// (n must be unit length).  v' = v − 2·(v·n)·n.
		/// 6 muls + 3 adds - cheaper than any library call.
		/// </summary>
		[MethodImpl( MethodImplOptions.AggressiveInlining )]
		public static Vector3 Reflect( in Vector3 v, in Vector3 n )
		{
			float d2 = 2f * Dot( v, n );
			return new Vector3( v.X - d2 * n.X, v.Y - d2 * n.Y, v.Z - d2 * n.Z );
		}

		/// <summary>2-D reflection about unit normal n.</summary>
		[MethodImpl( MethodImplOptions.AggressiveInlining )]
		public static Vector2 Reflect( in Vector2 v, in Vector2 n )
		{
			float d2 = 2f * Dot( v, n );
			return new Vector2( v.X - d2 * n.X, v.Y - d2 * n.Y );
		}

		/// <summary>
		/// Projects <paramref name="v"/> onto unit vector <paramref name="onto"/>.
		/// v_proj = (v·onto)·onto.  Result is parallel to onto.
		/// </summary>
		[MethodImpl( MethodImplOptions.AggressiveInlining )]
		public static Vector3 Project( in Vector3 v, in Vector3 onto )
		{
			float d = Dot( v, onto );
			return new Vector3( d * onto.X, d * onto.Y, d * onto.Z );
		}

		/// <summary>
		/// Projects <paramref name="v"/> onto non-unit vector <paramref name="onto"/>.
		/// Cheaper than normalizing onto first when both vectors are hot.
		///
		/// Hack: uses FastInvSqrt to compute 1/|onto|² and avoid division.
		/// </summary>
		[MethodImpl( MethodImplOptions.AggressiveInlining )]
		public static Vector3 ProjectOnto( in Vector3 v, in Vector3 onto )
		{
			float sq = onto.X * onto.X + onto.Y * onto.Y + onto.Z * onto.Z;
			if ( sq < SMALL_NUMBER ) return Vector3.Zero;
			float invSq = FastInvSqrt( sq ) * FastInvSqrt( sq ); // 1/sq ≈ invSqrt²
			float scale = Dot( v, onto ) * invSq;
			return new Vector3( scale * onto.X, scale * onto.Y, scale * onto.Z );
		}

		/// <summary>
		/// Returns the component of <paramref name="v"/> perpendicular to
		/// unit vector <paramref name="onto"/> (v − Project(v, onto)).
		/// </summary>
		[MethodImpl( MethodImplOptions.AggressiveInlining )]
		public static Vector3 ProjectPerp( in Vector3 v, in Vector3 onto )
		{
			float d = Dot( v, onto );
			return new Vector3( v.X - d * onto.X, v.Y - d * onto.Y, v.Z - d * onto.Z );
		}

		#endregion

		#region Clamp vector lengths

		/// <summary>
		/// Clamps <paramref name="v"/> so its length does not exceed
		/// <paramref name="maxLength"/>.  Returns v unchanged if already shorter.
		///
		/// Hack: squared comparison avoids sqrt for the common fast path.
		/// FastInvSqrt is called only when the clamp is actually needed.
		/// </summary>
		[MethodImpl( MethodImplOptions.AggressiveInlining )]
		public static Vector3 ClampLength( in Vector3 v, float maxLength )
		{
			float sq = v.X * v.X + v.Y * v.Y + v.Z * v.Z;
			float max2 = maxLength * maxLength;
			if ( sq <= max2 ) return v;                      // fast path - no sqrt
			float scale = maxLength * FastInvSqrt( sq );     // scale = maxLen / |v|
			return new Vector3( v.X * scale, v.Y * scale, v.Z * scale );
		}

		/// <summary>2-D version of ClampLength.</summary>
		[MethodImpl( MethodImplOptions.AggressiveInlining )]
		public static Vector2 ClampLength( in Vector2 v, float maxLength )
		{
			float sq = v.X * v.X + v.Y * v.Y;
			float max2 = maxLength * maxLength;
			if ( sq <= max2 ) return v;
			float scale = maxLength * FastInvSqrt( sq );
			return new Vector2( v.X * scale, v.Y * scale );
		}

		#endregion

		#region MoveTowards - useful for AI steering, interpolated movement

		/// <summary>
		/// Moves a Vector3 position toward <paramref name="target"/> by at most
		/// <paramref name="maxDelta"/> per call.  Does NOT overshoot.
		///
		/// Hack: squared distance comparison before FastSqrt so the very common
		/// "already at target" case costs zero sqrt.
		/// </summary>
		[MethodImpl( MethodImplOptions.AggressiveInlining )]
		public static Vector3 MoveTowards( in Vector3 current, in Vector3 target,
										  float maxDelta )
		{
			float dx = target.X - current.X;
			float dy = target.Y - current.Y;
			float dz = target.Z - current.Z;
			float sq = dx * dx + dy * dy + dz * dz;
			float max2 = maxDelta * maxDelta;
			if ( sq <= max2 || sq < SMALL_NUMBER ) return target;   // already close
			float scale = maxDelta * FastInvSqrt( sq );             // maxDelta / dist
			return new Vector3( current.X + dx * scale,
							   current.Y + dy * scale,
							   current.Z + dz * scale );
		}

		/// <summary>2-D MoveTowards.</summary>
		[MethodImpl( MethodImplOptions.AggressiveInlining )]
		public static Vector2 MoveTowards( in Vector2 current, in Vector2 target,
										  float maxDelta )
		{
			float dx = target.X - current.X;
			float dy = target.Y - current.Y;
			float sq = dx * dx + dy * dy;
			float max2 = maxDelta * maxDelta;
			if ( sq <= max2 || sq < SMALL_NUMBER ) return target;
			float scale = maxDelta * FastInvSqrt( sq );
			return new Vector2( current.X + dx * scale,
							   current.Y + dy * scale );
		}

		#endregion

		#region Lerp Vector2 / Vector3

		/// <summary>Component-wise linear interpolation for Vector3. t clamped to [0,1].</summary>
		[MethodImpl( MethodImplOptions.AggressiveInlining )]
		public static Vector3 Lerp( in Vector3 a, in Vector3 b, float t )
		{
			t = Clamp01( t );
			return new Vector3( a.X + ( b.X - a.X ) * t,
							   a.Y + ( b.Y - a.Y ) * t,
							   a.Z + ( b.Z - a.Z ) * t );
		}

		/// <summary>Component-wise linear interpolation for Vector2. t clamped to [0,1].</summary>
		[MethodImpl( MethodImplOptions.AggressiveInlining )]
		public static Vector2 Lerp( in Vector2 a, in Vector2 b, float t )
		{
			t = Clamp01( t );
			return new Vector2( a.X + ( b.X - a.X ) * t,
							   a.Y + ( b.Y - a.Y ) * t );
		}

		#endregion
	}
}
