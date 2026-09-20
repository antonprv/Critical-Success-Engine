// Created by Anton Piruev in 2026.
// Any direct commercial use of derivative work is strictly prohibited.

using System;
using System.Numerics;

namespace Framework.Physics
{   /// <summary>
	/// What kind of gameplay object a collidable represents (see PhysicsWorld's narrow phase rules).
	/// Collision layers themselves are plain <see cref="uint"/> bitmasks throughout this API -
	/// Core has no opinion on what each bit means; that naming (e.g. "World", "Character",
	/// "Projectile") is a gameplay concern that belongs in the Godot-facing glue layer.
	/// </summary>
	public enum PhysicsObjectKind : byte
	{
		/// <summary>Regular solid body (level geometry, props, rigid bodies).</summary>
		Solid = 0,
		/// <summary>Kinematic character controller body, moved via <see cref="PhysicsWorld.MoveCharacter"/>.</summary>
		Character = 1,
		/// <summary>Non-solid sensor volume. Never produces a solver constraint, only overlap events.</summary>
		Trigger = 2,
		/// <summary>Fast-moving body swept via <see cref="PhysicsWorld.SweepProjectile"/>.</summary>
		Projectile = 3,
	}

	/// <summary>Opaque reference to a shape registered with a <see cref="PhysicsWorld"/>.</summary>
	public readonly struct ShapeHandle : IEquatable<ShapeHandle>
	{
		internal readonly uint Packed;
		internal ShapeHandle( uint packed ) => Packed = packed;
		public bool Equals( ShapeHandle other ) => Packed == other.Packed;
		public override bool Equals( object? obj ) => obj is ShapeHandle other && Equals( other );
		public override int GetHashCode() => (int)Packed;
	}

	/// <summary>Opaque reference to a dynamic or kinematic body registered with a <see cref="PhysicsWorld"/>.</summary>
	public readonly struct BodyHandle : IEquatable<BodyHandle>
	{
		internal readonly int Value;
		internal BodyHandle( int value ) => Value = value;
		public bool Equals( BodyHandle other ) => Value == other.Value;
		public override bool Equals( object? obj ) => obj is BodyHandle other && Equals( other );
		public override int GetHashCode() => Value;
	}

	/// <summary>Opaque reference to a static registered with a <see cref="PhysicsWorld"/>.</summary>
	public readonly struct StaticHandle : IEquatable<StaticHandle>
	{
		internal readonly int Value;
		internal StaticHandle( int value ) => Value = value;
		public bool Equals( StaticHandle other ) => Value == other.Value;
		public override bool Equals( object? obj ) => obj is StaticHandle other && Equals( other );
		public override int GetHashCode() => Value;
	}

	/// <summary>Position + orientation, decoupled from any particular engine's pose type.</summary>
	public readonly struct PhysicsTransform
	{
		public readonly Vector3 Position;
		public readonly Quaternion Orientation;

		public PhysicsTransform( Vector3 position, Quaternion orientation )
		{
			Position = position;
			Orientation = orientation;
		}

		public static PhysicsTransform FromPosition( Vector3 position ) => new( position, Quaternion.Identity );
	}

	/// <summary>Tuning knobs for a <see cref="PhysicsWorld"/> instance.</summary>
	public readonly struct PhysicsWorldSettings
	{
		public readonly Vector3 Gravity;
		public readonly int VelocityIterations;
		public readonly int Substeps;
		public readonly bool UseMultithreading;
		public readonly float FrictionCoefficient;
		public readonly float MaximumRecoveryVelocity;

		public PhysicsWorldSettings(
			Vector3 gravity,
			int velocityIterations = 8,
			int substeps = 1,
			bool useMultithreading = true,
			float frictionCoefficient = 0.8f,
			float maximumRecoveryVelocity = 2f )
		{
			Gravity = gravity;
			VelocityIterations = velocityIterations;
			Substeps = substeps;
			UseMultithreading = useMultithreading;
			FrictionCoefficient = frictionCoefficient;
			MaximumRecoveryVelocity = maximumRecoveryVelocity;
		}

		public static PhysicsWorldSettings Default => new( new Vector3( 0f, -20f, 0f ) );
	}

	/// <summary>One overlap transition detected during a <see cref="PhysicsWorld.Step"/> call.</summary>
	public readonly struct OverlapEvent
	{
		public readonly int OwnerIdA;
		public readonly int OwnerIdB;
		public readonly bool Entered;

		public OverlapEvent( int ownerIdA, int ownerIdB, bool entered )
		{
			OwnerIdA = ownerIdA;
			OwnerIdB = ownerIdB;
			Entered = entered;
		}
	}

	/// <summary>Result of a <see cref="PhysicsWorld.MoveCharacter"/> call.</summary>
	public readonly struct CharacterMoveResult
	{
		public readonly Vector3 Position;
		public readonly bool IsOnFloor;
		public readonly Vector3 FloorNormal;

		/// <summary>
		/// OwnerId of whatever the character is standing on this tick (0 if not grounded, or
		/// grounded against something that never called RegisterOwner - shouldn't normally
		/// happen). Feed this into <see cref="PhysicsWorld.GetLinearVelocity"/> /
		/// <see cref="PhysicsWorld.GetAngularVelocity"/> (via that owner's own BodyHandle) to
		/// carry the character along with a moving platform - MoveCharacter itself only
		/// resolves collide-and-slide against wherever things are *right now*, it has no
		/// notion of "this floor moved since last tick, bring me with it."
		/// </summary>
		public readonly int GroundOwnerId;

		public readonly Vector3 Velocity;

		public CharacterMoveResult( Vector3 position, bool isOnFloor, Vector3 floorNormal, int groundOwnerId, Vector3 velocity )
		{
			Position = position;
			IsOnFloor = isOnFloor;
			FloorNormal = floorNormal;
			GroundOwnerId = groundOwnerId;
			Velocity = velocity;
		}
	}

	/// <summary>Tuning knobs for <see cref="PhysicsWorld.MoveCharacter"/>. Defaults match common Quake-like values.</summary>
	public readonly struct CharacterMoveOptions
	{
		public readonly int MaxSlideIterations;
		public readonly float SkinWidth;
		public readonly float MaxFloorAngleDegrees;
		public readonly float FloorProbeDistance;

		public CharacterMoveOptions(
			int maxSlideIterations = 4,
			float skinWidth = 0.015f,
			float maxFloorAngleDegrees = 46f,
			float floorProbeDistance = 0.08f
		)
		{
			MaxSlideIterations = maxSlideIterations;
			SkinWidth = skinWidth;
			MaxFloorAngleDegrees = maxFloorAngleDegrees;
			FloorProbeDistance = floorProbeDistance;
		}

		public static CharacterMoveOptions Default => new CharacterMoveOptions();
	}

	/// <summary>Result of a <see cref="PhysicsWorld.SweepSphereCast"/> call - a generic, body-less sweep query.</summary>
	public readonly struct ShapeCastResult
	{
		public readonly bool Hit;

		/// <summary>Where the swept shape's center ended up - either the full cast distance, or pulled back to just touching the hit surface.</summary>
		public readonly Vector3 Position;

		/// <summary>The actual point on the hit surface. Only meaningful when <see cref="Hit"/> is true.</summary>
		public readonly Vector3 Point;
		public readonly Vector3 Normal;
		public readonly float Distance;
		public readonly int HitOwnerId;

		public ShapeCastResult(
			bool hit,
			Vector3 position,
			Vector3 point,
			Vector3 normal,
			float distance,
			int hitOwnerId
		)
		{
			Hit = hit;
			Position = position;
			Point = point;
			Normal = normal;
			Distance = distance;
			HitOwnerId = hitOwnerId;
		}
	}

	/// <summary>Result of a <see cref="PhysicsWorld.SweepProjectile"/> call.</summary>
	public readonly struct ProjectileSweepResult
	{
		public readonly bool Hit;
		public readonly Vector3 Position;
		public readonly Vector3 Point;
		public readonly Vector3 Normal;
		public readonly int HitOwnerId;

		public ProjectileSweepResult(
			bool hit,
			Vector3 position,
			Vector3 point,
			Vector3 normal,
			int hitOwnerId
		)
		{
			Hit = hit;
			Position = position;
			Point = point;
			Normal = normal;
			HitOwnerId = hitOwnerId;
		}
	}
}