// Created by Anton Piruev in 2026. 
// Any direct commercial use of derivative work is strictly prohibited.

using System.Numerics;
using System.Runtime.CompilerServices;

namespace Framework.FastMath.Numerics.Extensions
{
	/// <summary>
	/// Extension methods for convenient usage directly on System.Numerics types.
	/// All methods delegate to Framework.FastMath.Numerics.FMath - no logic lives here.
	/// In-place methods use `ref this` (C# 7.2+) to mutate the original struct.
	/// </summary>
	public static partial class FastMathExtensions
	{
		// ================================================================
		// float extensions
		// ================================================================

		#region Square Root

		[MethodImpl( MethodImplOptions.AggressiveInlining )]
		public static float FastSqrt( this float value )
			=> FMath.FastSqrt( value );

		[MethodImpl( MethodImplOptions.AggressiveInlining )]
		public static float FastInvSqrt( this float value )
			=> FMath.FastInvSqrt( value );

		[MethodImpl( MethodImplOptions.AggressiveInlining )]
		public static bool IsNearlyEqual(
			this float value, float other,
			float epsilon = FMath.KINDA_SMALL_NUMBER )
			=> FMath.IsNearlyEqual( value, other, epsilon );

		[MethodImpl( MethodImplOptions.AggressiveInlining )]
		public static bool IsNearlyZero(
			this float value, float epsilon = FMath.KINDA_SMALL_NUMBER )
			=> FMath.IsNearlyZero( value, epsilon );

		#endregion

		#region Trigonometry

		[MethodImpl( MethodImplOptions.AggressiveInlining )]
		public static float FastAtan( this float value, bool precise = false )
			=> FMath.FastAtan( value, precise );

		[MethodImpl( MethodImplOptions.AggressiveInlining )]
		public static float FastAtan2( this float y, float x, bool precise = false )
			=> FMath.FastAtan2( y, x, precise );

		#endregion

		#region Angle interpolation

		[MethodImpl( MethodImplOptions.AggressiveInlining )]
		public static float LerpAngle( this float a, float target, float t )
			=> FMath.LerpAngle( a, target, t );

		[MethodImpl( MethodImplOptions.AggressiveInlining )]
		public static float LerpAngleUnclamped( this float a, float target, float t )
			=> FMath.LerpAngleUnclamped( a, target, t );

		[MethodImpl( MethodImplOptions.AggressiveInlining )]
		public static float LerpAngleRad( this float a, float target, float t )
			=> FMath.LerpAngleRad( a, target, t );

		[MethodImpl( MethodImplOptions.AggressiveInlining )]
		public static float LerpAngleRadUnclamped( this float a, float target, float t )
			=> FMath.LerpAngleRadUnclamped( a, target, t );

		#endregion

		// ================================================================
		// Vector3 extensions
		// ================================================================

		#region Vector3 - Normalize

		/// <summary>
		/// Normalizes this Vector3 in-place using FastInvSqrt (Quake III).
		/// Mutates the original struct - no copy, no allocation.
		/// Usage: v.FastNormalize();
		/// </summary>
		[MethodImpl( MethodImplOptions.AggressiveInlining )]
		public static void FastNormalize( this ref Vector3 v )
			=> FMath.Normalize( ref v );

		/// <summary>
		/// Returns a new normalized Vector3 using FastInvSqrt.
		/// The original vector is not modified.
		/// Usage: var n = v.FastNormalized();
		/// </summary>
		[MethodImpl( MethodImplOptions.AggressiveInlining )]
		public static Vector3 FastNormalized( this in Vector3 v )
			=> FMath.Normalized( v );

		/// <summary>
		/// Returns true when |v|² is within epsilon of 1 - no sqrt.
		/// </summary>
		[MethodImpl( MethodImplOptions.AggressiveInlining )]
		public static bool IsNormalized( this in Vector3 v,
			float epsilon = FMath.KINDA_SMALL_NUMBER )
			=> FMath.IsNormalized( v, epsilon );

		#endregion

		#region Vector3 - Length / Distance

		[MethodImpl( MethodImplOptions.AggressiveInlining )]
		public static float FastLength( this in Vector3 v ) => FMath.FastLength( v );

		[MethodImpl( MethodImplOptions.AggressiveInlining )]
		public static float LengthSq( this in Vector3 v ) => FMath.LengthSq( v );

		[MethodImpl( MethodImplOptions.AggressiveInlining )]
		public static float FastDistanceTo( this in Vector3 a, in Vector3 b )
			=> FMath.FastDistance( a, b );

		[MethodImpl( MethodImplOptions.AggressiveInlining )]
		public static float DistanceSqTo( this in Vector3 a, in Vector3 b )
			=> FMath.DistanceSquared( a, b );

		#endregion

		#region Vector3 - Dot / Cross / Reflect / Project

		[MethodImpl( MethodImplOptions.AggressiveInlining )]
		public static float FastDot( this in Vector3 a, in Vector3 b )
			=> FMath.Dot( a, b );

		[MethodImpl( MethodImplOptions.AggressiveInlining )]
		public static Vector3 FastCross( this in Vector3 a, in Vector3 b )
			=> FMath.Cross( a, b );

		[MethodImpl( MethodImplOptions.AggressiveInlining )]
		public static Vector3 FastReflect( this in Vector3 v, in Vector3 normal )
			=> FMath.Reflect( v, normal );

		[MethodImpl( MethodImplOptions.AggressiveInlining )]
		public static Vector3 FastProject( this in Vector3 v, in Vector3 onto )
			=> FMath.Project( v, onto );

		[MethodImpl( MethodImplOptions.AggressiveInlining )]
		public static Vector3 FastProjectPerp( this in Vector3 v, in Vector3 onto )
			=> FMath.ProjectPerp( v, onto );

		#endregion

		#region Vector3 - IsNearlyEqual

		/// <summary>
		/// Compares two Vector3 values with epsilon tolerance (component-wise).
		/// Uses unsafe pointer arithmetic to avoid struct copies and field boxing.
		/// Unrolled loop with early-exit on first mismatch.
		/// Cost: 3 subtractions + 6 comparisons, no allocations.
		/// </summary>
		[MethodImpl( MethodImplOptions.AggressiveInlining )]
		public static unsafe bool IsNearlyEqual( this in Vector3 vec3, in Vector3 anotherVec3,
			float epsilon = FMath.KINDA_SMALL_NUMBER )
		{
			// Pin both structs and read component-wise via pointer arithmetic
			fixed ( float* p1 = &vec3.X )
			fixed ( float* p2 = &anotherVec3.X )
			{
				for ( int i = 0; i < 3; i++ )
				{
					float diff = p1[ i ] - p2[ i ];
					// Bitwise AND avoids second branch: |diff| < epsilon ⟺ −ε < diff < ε
					if ( ( diff < epsilon ) & ( diff > -epsilon ) ) continue;
					return false;
				}
				return true;
			}
		}

		[MethodImpl( MethodImplOptions.AggressiveInlining )]
		public static unsafe bool IsNearlyZero( this in Vector3 vec3,
			float epsilon = FMath.KINDA_SMALL_NUMBER ) => vec3.IsNearlyEqual( Vector3.Zero, epsilon );

		#endregion

		#region Vector3 - ClampLength / MoveTowards / Lerp

		[MethodImpl( MethodImplOptions.AggressiveInlining )]
		public static Vector3 FastClampLength( this in Vector3 v, float maxLength )
			=> FMath.ClampLength( v, maxLength );

		[MethodImpl( MethodImplOptions.AggressiveInlining )]
		public static Vector3 FastMoveTowards( this in Vector3 current,
			in Vector3 target, float maxDelta )
			=> FMath.MoveTowards( current, target, maxDelta );

		[MethodImpl( MethodImplOptions.AggressiveInlining )]
		public static Vector3 FastLerp( this in Vector3 a, in Vector3 b, float t )
			=> FMath.Lerp( a, b, t );

		#endregion

		#region Vector3 - rotation via quaternion

		/// <summary>
		/// Rotates this vector by a unit quaternion (Rodrigues' formula).
		/// Usage: var world = localV.FastRotatedBy(q);
		/// </summary>
		[MethodImpl( MethodImplOptions.AggressiveInlining )]
		public static Vector3 FastRotatedBy( this in Vector3 v, in Quaternion q )
			=> FMath.Rotate( q, v );

		#endregion

		// ================================================================
		// Vector2 extensions
		// ================================================================

		#region Vector2 - Normalize

		/// <summary>
		/// Normalizes this Vector2 in-place using FastInvSqrt (Quake III).
		/// Mutates the original struct - no copy, no allocation.
		/// Usage: v.FastNormalize();
		/// </summary>
		[MethodImpl( MethodImplOptions.AggressiveInlining )]
		public static void FastNormalize( this ref Vector2 v )
			=> FMath.Normalize( ref v );

		/// <summary>
		/// Returns a new normalized Vector2 using FastInvSqrt.
		/// Usage: var n = v.FastNormalized();
		/// </summary>
		[MethodImpl( MethodImplOptions.AggressiveInlining )]
		public static Vector2 FastNormalized( this in Vector2 v )
			=> FMath.Normalized( v );

		/// <summary>
		/// Returns true when |v|² is within epsilon of 1 - no sqrt.
		/// </summary>
		[MethodImpl( MethodImplOptions.AggressiveInlining )]
		public static bool IsNormalized( this in Vector2 v,
			float epsilon = FMath.KINDA_SMALL_NUMBER )
			=> FMath.IsNormalized( v, epsilon );

		#endregion

		#region Vector2 - Length / Distance

		[MethodImpl( MethodImplOptions.AggressiveInlining )]
		public static float FastLength( this in Vector2 v ) => FMath.FastLength( v );

		[MethodImpl( MethodImplOptions.AggressiveInlining )]
		public static float LengthSq( this in Vector2 v ) => FMath.LengthSq( v );

		[MethodImpl( MethodImplOptions.AggressiveInlining )]
		public static float FastDistanceTo( this in Vector2 a, in Vector2 b )
			=> FMath.FastDistance( a, b );

		[MethodImpl( MethodImplOptions.AggressiveInlining )]
		public static float DistanceSqTo( this in Vector2 a, in Vector2 b )
			=> FMath.DistanceSquared( a, b );

		#endregion

		#region Vector2 - Dot / PerpDot / Reflect

		[MethodImpl( MethodImplOptions.AggressiveInlining )]
		public static float FastDot( this in Vector2 a, in Vector2 b )
			=> FMath.Dot( a, b );

		/// <summary>2-D perp-dot (a.X·b.Y − a.Y·b.X). Sign = left/right of a.</summary>
		[MethodImpl( MethodImplOptions.AggressiveInlining )]
		public static float FastPerpDot( this in Vector2 a, in Vector2 b )
			=> FMath.PerpDot( a, b );

		[MethodImpl( MethodImplOptions.AggressiveInlining )]
		public static Vector2 FastReflect( this in Vector2 v, in Vector2 normal )
			=> FMath.Reflect( v, normal );

		#endregion

		#region Vector2 - IsNearlyEqual

		/// <summary>
		/// Compares two Vector2 values with epsilon tolerance (component-wise).
		/// Uses unsafe pointer arithmetic to avoid struct copies.
		/// Cost: 2 subtractions + 4 comparisons, no allocations.
		/// </summary>
		[MethodImpl( MethodImplOptions.AggressiveInlining )]
		public static unsafe bool IsNearlyEqual( this in Vector2 vec2, in Vector2 anotherVec2,
			float epsilon = FMath.KINDA_SMALL_NUMBER )
		{
			fixed ( float* p1 = &vec2.X )
			fixed ( float* p2 = &anotherVec2.X )
			{
				for ( int i = 0; i < 2; i++ )
				{
					float diff = p1[ i ] - p2[ i ];
					if ( ( diff < epsilon ) & ( diff > -epsilon ) ) continue;
					return false;
				}
				return true;
			}
		}

		#endregion

		#region Vector2 - ClampLength / MoveTowards / Lerp

		[MethodImpl( MethodImplOptions.AggressiveInlining )]
		public static Vector2 FastClampLength( this in Vector2 v, float maxLength )
			=> FMath.ClampLength( v, maxLength );

		[MethodImpl( MethodImplOptions.AggressiveInlining )]
		public static Vector2 FastMoveTowards( this in Vector2 current,
			in Vector2 target, float maxDelta )
			=> FMath.MoveTowards( current, target, maxDelta );

		[MethodImpl( MethodImplOptions.AggressiveInlining )]
		public static Vector2 FastLerp( this in Vector2 a, in Vector2 b, float t )
			=> FMath.Lerp( a, b, t );

		#endregion

		// ================================================================
		// System.Numerics.Quaternion extensions
		// ================================================================

		#region Quaternion - IsNearlyEqual

		/// <summary>
		/// Compares two quaternions with epsilon tolerance (component-wise).
		/// Uses unsafe pointer arithmetic for fast unrolled comparison.
		/// Cost: 4 subtractions + 8 comparisons, no allocations.
		/// </summary>
		[MethodImpl( MethodImplOptions.AggressiveInlining )]
		public static unsafe bool IsNearlyEqual( this in Quaternion quat, in Quaternion anotherQuat,
			float epsilon = FMath.KINDA_SMALL_NUMBER )
		{
			fixed ( float* p1 = &quat.X )
			fixed ( float* p2 = &anotherQuat.X )
			{
				for ( int i = 0; i < 4; i++ )
				{
					float diff = p1[ i ] - p2[ i ];
					if ( ( diff < epsilon ) & ( diff > -epsilon ) ) continue;
					return false;
				}
				return true;
			}
		}

		#endregion

		#region Quaternion - Normalize

		/// <summary>
		/// Normalizes this quaternion in-place using FastInvSqrt (Quake III).
		/// Mutates the original struct - no copy, no allocation.
		/// Usage: q.FastNormalize();
		/// </summary>
		[MethodImpl( MethodImplOptions.AggressiveInlining )]
		public static void FastNormalize( this ref Quaternion q )
			=> FMath.Normalize( ref q );

		/// <summary>
		/// Returns a new normalized quaternion using FastInvSqrt.
		/// Usage: var n = q.FastNormalized();
		/// </summary>
		[MethodImpl( MethodImplOptions.AggressiveInlining )]
		public static Quaternion FastNormalized( this in Quaternion q )
			=> FMath.Normalized( q );

		/// <summary>Returns true when |q|² is within epsilon of 1 (no sqrt).</summary>
		[MethodImpl( MethodImplOptions.AggressiveInlining )]
		public static bool IsNormalized( this in Quaternion q,
			float epsilon = FMath.KINDA_SMALL_NUMBER )
			=> FMath.IsNormalized( q, epsilon );

		#endregion

		#region Quaternion - Length

		[MethodImpl( MethodImplOptions.AggressiveInlining )]
		public static float FastLength( this in Quaternion q ) => FMath.QuatLength( q );

		[MethodImpl( MethodImplOptions.AggressiveInlining )]
		public static float LengthSq( this in Quaternion q ) => FMath.LengthSq( q );

		#endregion

		#region Quaternion - Conjugate / Inverse

		[MethodImpl( MethodImplOptions.AggressiveInlining )]
		public static Quaternion FastConjugate( this in Quaternion q )
			=> FMath.Conjugate( q );

		[MethodImpl( MethodImplOptions.AggressiveInlining )]
		public static Quaternion FastInverse( this in Quaternion q )
			=> FMath.Inverse( q );

		#endregion

		#region Quaternion - Multiplication

		[MethodImpl( MethodImplOptions.AggressiveInlining )]
		public static Quaternion FastMultiply( this in Quaternion a, in Quaternion b )
			=> FMath.Multiply( a, b );

		#endregion

		#region Quaternion - Vector rotation

		[MethodImpl( MethodImplOptions.AggressiveInlining )]
		public static Vector3 FastRotate( this in Quaternion q, in Vector3 v )
			=> FMath.Rotate( q, v );

		[MethodImpl( MethodImplOptions.AggressiveInlining )]
		public static Vector3 FastInverseRotate( this in Quaternion q, in Vector3 v )
			=> FMath.InverseRotate( q, v );

		#endregion

		#region Quaternion - Dot / Angle / IsIdentity

		[MethodImpl( MethodImplOptions.AggressiveInlining )]
		public static float FastDot( this in Quaternion a, in Quaternion b )
			=> FMath.Dot( a, b );

		[MethodImpl( MethodImplOptions.AggressiveInlining )]
		public static float FastAngleTo( this in Quaternion a, in Quaternion b )
			=> FMath.AngleBetween( a, b );

		[MethodImpl( MethodImplOptions.AggressiveInlining )]
		public static bool IsIdentity( this in Quaternion q,
			float epsilon = FMath.KINDA_SMALL_NUMBER )
			=> FMath.IsIdentity( q, epsilon );

		#endregion

		#region Quaternion - Interpolation

		[MethodImpl( MethodImplOptions.AggressiveInlining )]
		public static Quaternion FastNlerp( this in Quaternion a, in Quaternion b, float t )
			=> FMath.Nlerp( a, b, t );

		[MethodImpl( MethodImplOptions.AggressiveInlining )]
		public static Quaternion FastSlerp( this in Quaternion a, in Quaternion b, float t )
			=> FMath.FastSlerp( a, b, t );

		[MethodImpl( MethodImplOptions.AggressiveInlining )]
		public static Quaternion FastSquad(
			this in Quaternion a,
			in Quaternion ta, in Quaternion tb,
			in Quaternion b, float t )
			=> FMath.Squad( a, ta, tb, b, t );

		[MethodImpl( MethodImplOptions.AggressiveInlining )]
		public static Quaternion FastSquadTangent(
			this in Quaternion q,
			in Quaternion prev, in Quaternion next )
			=> FMath.SquadTangent( prev, q, next );

		#endregion

		#region Quaternion - RotateTowards

		[MethodImpl( MethodImplOptions.AggressiveInlining )]
		public static Quaternion FastRotateTowards(
			this in Quaternion from, in Quaternion to, float maxRadiansDelta )
			=> FMath.RotateTowards( from, to, maxRadiansDelta );

		#endregion

		#region Quaternion - Exp / Log

		[MethodImpl( MethodImplOptions.AggressiveInlining )]
		public static Quaternion FastExp( this in Quaternion q ) => FMath.Exp( q );

		[MethodImpl( MethodImplOptions.AggressiveInlining )]
		public static Quaternion FastLog( this in Quaternion q ) => FMath.Log( q );

		#endregion

		#region Quaternion - Axis/Angle conversion

		/// <summary>
		/// Creates a unit quaternion from a unit axis and an angle (radians).
		/// Uses FastSin + FastCos polynomials - no Math.Sin/Cos call.
		/// </summary>
		[MethodImpl( MethodImplOptions.AggressiveInlining )]
		public static Quaternion FastFromAxisAngle( this in Vector3 axis, float angle )
			=> FMath.FromAxisAngle( axis, angle );

		/// <summary>
		/// Extracts rotation axis and angle from a unit quaternion.
		/// Uses FastInvSqrt + FastAtan2 - no Math.Acos/Math.Sqrt call.
		/// </summary>
		[MethodImpl( MethodImplOptions.AggressiveInlining )]
		public static void FastToAxisAngle( this in Quaternion q,
			out Vector3 axis, out float angle )
			=> FMath.ToAxisAngle( q, out axis, out angle );

		#endregion
	}
}
