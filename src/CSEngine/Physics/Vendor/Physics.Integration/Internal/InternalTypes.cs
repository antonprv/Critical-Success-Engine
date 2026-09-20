// Created by Anton Piruev in 2026.
// Any direct commercial use of derivative work is strictly prohibited.

using System;
using System.Runtime.CompilerServices;

namespace Framework.Physics.Internal
{
	/// <summary>
	/// Per-collidable data stored in a <see cref="BepuPhysics.CollidableProperty{T}"/>, indexed by
	/// body/static handle. Must stay an unmanaged blittable struct. Never exposed publicly -
	/// consumers only ever see the plain <see cref="int"/> OwnerId via <see cref="OverlapEvent"/>.
	/// </summary>
	internal struct CollidableUserData : IEquatable<CollidableUserData>
	{
		public uint Layer;
		public uint Mask;
		public PhysicsObjectKind Kind;
		public int OwnerId;

		[MethodImpl( MethodImplOptions.AggressiveInlining )]
		public bool CanInteractWith( in CollidableUserData other ) =>
			( Layer & other.Mask ) != 0 && ( other.Layer & Mask ) != 0;

		public bool Equals( CollidableUserData other ) =>
			Layer == other.Layer && Mask == other.Mask && Kind == other.Kind && OwnerId == other.OwnerId;

		public override bool Equals( object? obj ) => obj is CollidableUserData other && Equals( other );
		public override int GetHashCode() => HashCode.Combine( Layer, Mask, (byte)Kind, OwnerId );
	}

	/// <summary>
	/// Identifies an overlapping pair of collidables for a single simulation step, used to diff
	/// "currently touching" sets between frames in order to raise Entered/Exited events.
	/// Symmetric: (a,b) == (b,a).
	/// </summary>
	internal readonly struct ContactPairKey : IEquatable<ContactPairKey>
	{
		public readonly uint PackedA;
		public readonly uint PackedB;

		public ContactPairKey( uint packedA, uint packedB )
		{
			if ( packedA <= packedB ) { PackedA = packedA; PackedB = packedB; }
			else { PackedA = packedB; PackedB = packedA; }
		}

		public bool Equals( ContactPairKey other ) => PackedA == other.PackedA && PackedB == other.PackedB;
		public override bool Equals( object? obj ) => obj is ContactPairKey other && Equals( other );
		public override int GetHashCode() => HashCode.Combine( PackedA, PackedB );
	}
}
