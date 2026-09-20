// Created by Anton Piruev in 2026. 
// Any direct commercial use of derivative work is strictly prohibited.

using System.Numerics;
using System.Runtime.CompilerServices;

namespace Framework.FastMath.Numerics
{
	// Uses the general-purpose FastSin/FastCos (Core/Trigonometry.cs), not the
	// [-π/2, π/2]-only "Unsafe" fast path: yaw/pitch/roll arguments here are
	// caller-supplied and NOT guaranteed to be pre-normalized (e.g. accumulated
	// rotation over many frames can drift outside [-π, π] well before anyone
	// wraps it).
	public static partial class FMath
	{
		#region FromEulerZYX - Most common convention (Yaw-Pitch-Roll)

		/// <summary>
		/// Creates a quaternion from Euler angles (ZYX order / Yaw-Pitch-Roll).
		/// This is the most common convention in game engines (Godot, UE5).
		/// 
		/// Order: Apply rotation around Z (yaw) first, then Y (pitch), then X (roll).
		/// 
		/// Parameters in radians:
		///   yaw   - rotation around Z axis (left/right turn)
		///   pitch - rotation around Y axis (up/down look)
		///   roll  - rotation around X axis (left/right tilt)
		/// 
		/// Formula uses half-angles to build quaternion efficiently.
		/// No Math.Sin/Cos calls - uses fast polynomial approximations.
		/// Safe for any finite input angle (see class remarks).
		/// </summary>
		[MethodImpl( MethodImplOptions.AggressiveInlining )]
		public static Quaternion FromEulerZYX( float yaw, float pitch, float roll )
		{
			// Half angles - the quaternion formula uses sin(θ/2), cos(θ/2)
			float hy = yaw * 0.5f;
			float hp = pitch * 0.5f;
			float hr = roll * 0.5f;

			// FastSin/FastCos handle arbitrary sign and magnitude internally
			// (range-reduce + reflect) - no manual abs/sign-restore needed here.
			float sy = FastSin( hy ); float cy = FastCos( hy );
			float sp = FastSin( hp ); float cp = FastCos( hp );
			float sr = FastSin( hr ); float cr = FastCos( hr );

			// ZYX order formula (derived from Rodrigues via rotation matrices)
			// q = qz(yaw) · qy(pitch) · qx(roll)
			float x = sr * cp * cy - cr * sp * sy;
			float y = cr * sp * cy + sr * cp * sy;
			float z = cr * cp * sy - sr * sp * cy;
			float w = cr * cp * cy + sr * sp * sy;

			return new Quaternion( x, y, z, w );
		}

		/// <summary>
		/// Converts Euler angles (ZYX) in degrees to quaternion.
		/// Convenience wrapper around FromEulerZYX that handles degree→radian conversion.
		/// </summary>
		[MethodImpl( MethodImplOptions.AggressiveInlining )]
		public static Quaternion FromEulerZYXDegrees( float yawDeg, float pitchDeg, float rollDeg )
			=> FromEulerZYX( yawDeg * Deg2Rad, pitchDeg * Deg2Rad, rollDeg * Deg2Rad );

		#endregion

		#region FromEulerXYZ - Alternative convention (Roll-Pitch-Yaw)

		/// <summary>
		/// Creates a quaternion from Euler angles (XYZ order / Roll-Pitch-Yaw).
		/// Alternative convention used in some animation systems and tools.
		/// 
		/// Order: Apply rotation around X (roll) first, then Y (pitch), then Z (yaw).
		/// 
		/// Parameters in radians:
		///   roll  - rotation around X axis
		///   pitch - rotation around Y axis
		///   yaw   - rotation around Z axis
		/// </summary>
		[MethodImpl( MethodImplOptions.AggressiveInlining )]
		public static Quaternion FromEulerXYZ( float roll, float pitch, float yaw )
		{
			float hr = roll * 0.5f;
			float hp = pitch * 0.5f;
			float hy = yaw * 0.5f;

			float sr = FastSin( hr ); float cr = FastCos( hr );
			float sp = FastSin( hp ); float cp = FastCos( hp );
			float sy = FastSin( hy ); float cy = FastCos( hy );

			// XYZ order formula
			// q = qx(roll) · qy(pitch) · qz(yaw)
			float x = sr * cp * cy + cr * sp * sy;
			float y = cr * sp * cy - sr * cp * sy;
			float z = cr * cp * sy + sr * sp * cy;
			float w = cr * cp * cy - sr * sp * sy;

			return new Quaternion( x, y, z, w );
		}

		/// <summary>
		/// Converts Euler angles (XYZ) in degrees to quaternion.
		/// </summary>
		[MethodImpl( MethodImplOptions.AggressiveInlining )]
		public static Quaternion FromEulerXYZDegrees( float rollDeg, float pitchDeg, float yawDeg )
			=> FromEulerXYZ( rollDeg * Deg2Rad, pitchDeg * Deg2Rad, yawDeg * Deg2Rad );

		#endregion

		#region FromEulerYXZ - For certain animation systems

		/// <summary>
		/// Creates a quaternion from Euler angles (YXZ order).
		/// Used in some animation authoring tools (e.g., certain Maya setups).
		/// 
		/// Order: Y (pitch) first, then X (roll), then Z (yaw).
		/// </summary>
		[MethodImpl( MethodImplOptions.AggressiveInlining )]
		public static Quaternion FromEulerYXZ( float pitch, float roll, float yaw )
		{
			float hp = pitch * 0.5f;
			float hr = roll * 0.5f;
			float hy = yaw * 0.5f;

			float sp = FastSin( hp ); float cp = FastCos( hp );
			float sr = FastSin( hr ); float cr = FastCos( hr );
			float sy = FastSin( hy ); float cy = FastCos( hy );

			// YXZ order formula
			float x = sr * cp * cy - cr * sp * sy;
			float y = cr * sp * cy + sr * cp * sy;
			float z = cr * cp * sy + sr * sp * cy;
			float w = cr * cp * cy - sr * sp * sy;

			return new Quaternion( x, y, z, w );
		}

		/// <summary>
		/// Converts Euler angles (YXZ) in degrees to quaternion.
		/// </summary>
		[MethodImpl( MethodImplOptions.AggressiveInlining )]
		public static Quaternion FromEulerYXZDegrees( float pitchDeg, float rollDeg, float yawDeg )
			=> FromEulerYXZ( pitchDeg * Deg2Rad, rollDeg * Deg2Rad, yawDeg * Deg2Rad );

		#endregion

		#region FromEulerVector3 convenience overloads

		/// <summary>
		/// Creates a quaternion from a Vector3 containing Euler angles (ZYX order, radians).
		/// Convenience overload where euler = (roll, pitch, yaw) in radians.
		/// 
		/// Usage: Quaternion q = FMath.FromEulerZYX(new Vector3(roll, pitch, yaw));
		/// </summary>
		[MethodImpl( MethodImplOptions.AggressiveInlining )]
		public static Quaternion FromEulerZYX( in Vector3 euler )
			=> FromEulerZYX( euler.Z, euler.Y, euler.X );  // ZYX order

		/// <summary>
		/// Creates a quaternion from a Vector3 containing Euler angles (ZYX order, degrees).
		/// </summary>
		[MethodImpl( MethodImplOptions.AggressiveInlining )]
		public static Quaternion FromEulerZYXDegrees( in Vector3 eulerDeg )
			=> FromEulerZYXDegrees( eulerDeg.Z, eulerDeg.Y, eulerDeg.X );

		/// <summary>
		/// Creates a quaternion from a Vector3 containing Euler angles (XYZ order, radians).
		/// </summary>
		[MethodImpl( MethodImplOptions.AggressiveInlining )]
		public static Quaternion FromEulerXYZ( in Vector3 euler )
			=> FromEulerXYZ( euler.X, euler.Y, euler.Z );  // XYZ order

		/// <summary>
		/// Creates a quaternion from a Vector3 containing Euler angles (XYZ order, degrees).
		/// </summary>
		[MethodImpl( MethodImplOptions.AggressiveInlining )]
		public static Quaternion FromEulerXYZDegrees( in Vector3 eulerDeg )
			=> FromEulerXYZDegrees( eulerDeg.X, eulerDeg.Y, eulerDeg.Z );

		#endregion

		#region Extension method convenience wrappers

		/// <summary>
		/// Extension method: converts Vector3 Euler angles to quaternion (ZYX order, radians).
		/// Usage: var q = eulerAngles.FastFromEuler();
		/// </summary>
		[MethodImpl( MethodImplOptions.AggressiveInlining )]
		public static Quaternion FastFromEulerZYX( this in Vector3 eulerRad )
			=> FromEulerZYX( eulerRad );

		/// <summary>
		/// Extension method: converts Vector3 Euler angles to quaternion (ZYX order, degrees).
		/// Usage: var q = eulerAnglesDeg.FastFromEulerDegrees();
		/// </summary>
		[MethodImpl( MethodImplOptions.AggressiveInlining )]
		public static Quaternion FastFromEulerZYXDegrees( this in Vector3 eulerDeg )
			=> FromEulerZYXDegrees( eulerDeg );

		#endregion
	}
}
