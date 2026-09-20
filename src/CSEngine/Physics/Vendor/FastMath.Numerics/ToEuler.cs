// Created by Anton Piruev in 2026. 
// Any direct commercial use of derivative work is strictly prohibited.


using System.Numerics;
using System.Runtime.CompilerServices;

namespace Framework.FastMath.Numerics
{
	// Quaternion ToEuler converters - extract Euler angles from quaternions.
	// Inverse of FromEuler functions. Multiple rotation order conventions.
	public static partial class FMath
	{
		#region ToEulerZYX - Quaternion to Yaw-Pitch-Roll (Most Common)

		/// <summary>
		/// Extracts Euler angles (ZYX order) from a unit quaternion in radians.
		/// 
		/// Returns angles as (roll, pitch, yaw) in a Vector3:
		///   .X = roll  (rotation around X axis)
		///   .Y = pitch (rotation around Y axis)
		///   .Z = yaw   (rotation around Z axis)
		/// 
		/// All angles are in radians, in range approximately [-π, π].
		/// Uses FastAtan2 (polynomial approximation) instead of Math.Atan2.
		/// 
		/// Edge case: Gimbal lock occurs near pitch ≈ ±π/2.
		/// In gimbal lock, roll + yaw are ambiguous but their sum is preserved.
		/// </summary>
		[MethodImpl( MethodImplOptions.AggressiveInlining )]
		public static Vector3 FastToEulerZYX( this in Quaternion q )
		{
			float x = q.X, y = q.Y, z = q.Z, w = q.W;

			// Roll (X rotation)
			float sinr_cosp = 2f * ( w * x + y * z );
			float cosr_cosp = 1f - 2f * ( x * x + y * y );
			float roll = FastAtan2( sinr_cosp, cosr_cosp, precise: false );

			// Pitch (Y rotation)
			float sinp = 2f * ( w * y - z * x );
			// Clamp to [-1, 1] to handle numerical errors (gimbal lock region)
			sinp = sinp > 1f ? 1f : ( sinp < -1f ? -1f : sinp );
			float cosp = FastSqrt( 1f - sinp * sinp );
			float pitch = FastAtan2( sinp, cosp, precise: true );

			// Yaw (Z rotation)
			float siny_cosp = 2f * ( w * z + x * y );
			float cosy_cosp = 1f - 2f * ( y * y + z * z );
			float yaw = FastAtan2( siny_cosp, cosy_cosp, precise: false );

			return new Vector3( roll, pitch, yaw );
		}

		/// <summary>
		/// Extracts Euler angles (ZYX order) from a quaternion in degrees.
		/// Convenience wrapper around FastToEulerZYX that converts result to degrees.
		/// </summary>
		[MethodImpl( MethodImplOptions.AggressiveInlining )]
		public static Vector3 FastToEulerZYXDegrees( this in Quaternion q )
		{
			Vector3 euler = q.FastToEulerZYX();
			return euler * Rad2Deg;
		}

		#endregion

		#region ToEulerXYZ - Quaternion to Roll-Pitch-Yaw (Alternative)

		/// <summary>
		/// Extracts Euler angles (XYZ order) from a unit quaternion in radians.
		/// 
		/// Returns angles as (roll, pitch, yaw) in a Vector3:
		///   .X = roll  (X rotation, applied first)
		///   .Y = pitch (Y rotation, applied second)
		///   .Z = yaw   (Z rotation, applied third)
		/// 
		/// All angles in radians, approximately [-π, π].
		/// Uses FastAtan2 (polynomial) instead of Math.Atan2.
		/// </summary>
		[MethodImpl( MethodImplOptions.AggressiveInlining )]
		public static Vector3 FastToEulerXYZ( this in Quaternion q )
		{
			float x = q.X, y = q.Y, z = q.Z, w = q.W;

			// Roll (X rotation)
			float sinr = 2f * ( w * x - y * z );
			sinr = sinr > 1f ? 1f : ( sinr < -1f ? -1f : sinr );
			float cosr = FastSqrt( 1f - sinr * sinr );
			float roll = FastAtan2( sinr, cosr, precise: true );

			// Pitch (Y rotation)
			float siny_cosp = 2f * ( w * y + x * z );
			float cosy_cosp = 1f - 2f * ( y * y + z * z );
			float pitch = FastAtan2( siny_cosp, cosy_cosp, precise: false );

			// Yaw (Z rotation)
			float sinz_cosp = 2f * ( w * z - x * y );
			float cosz_cosp = 1f - 2f * ( z * z + y * y );
			float yaw = FastAtan2( sinz_cosp, cosz_cosp, precise: false );

			return new Vector3( roll, pitch, yaw );
		}

		/// <summary>
		/// Extracts Euler angles (XYZ order) from a quaternion in degrees.
		/// Convenience wrapper around FastToEulerXYZ that converts to degrees.
		/// </summary>
		[MethodImpl( MethodImplOptions.AggressiveInlining )]
		public static Vector3 FastToEulerXYZDegrees( this in Quaternion q )
		{
			Vector3 euler = q.FastToEulerXYZ();
			return euler * Rad2Deg;
		}

		#endregion

		#region ToEulerYXZ - Quaternion to Pitch-Roll-Yaw (Animation Systems)

		/// <summary>
		/// Extracts Euler angles (YXZ order) from a unit quaternion in radians.
		/// 
		/// Returns angles as (roll, pitch, yaw) in a Vector3:
		///   .X = roll  (X rotation, applied second)
		///   .Y = pitch (Y rotation, applied first)
		///   .Z = yaw   (Z rotation, applied third)
		/// 
		/// All angles in radians, approximately [-π, π].
		/// Uses FastAtan2 (polynomial) instead of Math.Atan2.
		/// </summary>
		[MethodImpl( MethodImplOptions.AggressiveInlining )]
		public static Vector3 FastToEulerYXZ( this in Quaternion q )
		{
			float x = q.X, y = q.Y, z = q.Z, w = q.W;

			// Pitch (Y rotation - applied first in YXZ)
			float sinp = 2f * ( w * y - z * x );
			sinp = sinp > 1f ? 1f : ( sinp < -1f ? -1f : sinp );
			float cosp = FastSqrt( 1f - sinp * sinp );
			float pitch = FastAtan2( sinp, cosp, precise: true );

			// Roll (X rotation - applied second)
			float sinr_cosp = 2f * ( w * x + y * z );
			float cosr_cosp = 1f - 2f * ( x * x + y * y );
			float roll = FastAtan2( sinr_cosp, cosr_cosp, precise: false );

			// Yaw (Z rotation - applied third)
			float siny_cosp = 2f * ( w * z + x * y );
			float cosy_cosp = 1f - 2f * ( y * y + z * z );
			float yaw = FastAtan2( siny_cosp, cosy_cosp, precise: false );

			return new Vector3( roll, pitch, yaw );
		}

		/// <summary>
		/// Extracts Euler angles (YXZ order) from a quaternion in degrees.
		/// Convenience wrapper around FastToEulerYXZ that converts to degrees.
		/// </summary>
		[MethodImpl( MethodImplOptions.AggressiveInlining )]
		public static Vector3 FastToEulerYXZDegrees( this in Quaternion q )
		{
			Vector3 euler = q.FastToEulerYXZ();
			return euler * Rad2Deg;
		}

		#endregion

		#region Bonus: Generic ToEuler that matches default Godot behavior

		/// <summary>
		/// Extracts Euler angles in the default Godot convention (ZYX order) in radians.
		/// Drop-in replacement for Quaternion.GetEuler() but using fast FastAtan2.
		/// 
		/// Usage: Vector3 euler = quaternion.FastToEuler();
		/// Returns angles in radians.
		/// </summary>
		[MethodImpl( MethodImplOptions.AggressiveInlining )]
		public static Vector3 FastToEuler( this in Quaternion q )
			=> q.FastToEulerZYX();

		/// <summary>
		/// Extracts Euler angles in the default Godot convention (ZYX order) in degrees.
		/// 
		/// Usage: Vector3 eulerDeg = quaternion.FastToEulerDegrees();
		/// Returns angles in degrees.
		/// </summary>
		[MethodImpl( MethodImplOptions.AggressiveInlining )]
		public static Vector3 FastToEulerDegrees( this in Quaternion q )
			=> q.FastToEulerZYXDegrees();

		#endregion
	}
}
