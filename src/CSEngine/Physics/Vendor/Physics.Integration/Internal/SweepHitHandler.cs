// Created by Anton Piruev in 2026.
// Any direct commercial use of derivative work is strictly prohibited.

using BepuPhysics;
using BepuPhysics.Collidables;
using System.Numerics;
using CoreBodyHandle = Framework.Physics.BodyHandle;

namespace Framework.Physics.Internal
{
	/// <summary>
	/// Sweep hit handler shared by <see cref="PhysicsWorld.MoveCharacter"/> and
	/// <see cref="PhysicsWorld.SweepProjectile"/>: ignores the sweeping body's own collidable and
	/// anything filtered out by collision layer/mask, keeps the closest hit, and records the
	/// hit collidable's OwnerId so callers can resolve "what did I hit" without ever seeing a
	/// <see cref="CollidableReference"/> themselves.
	/// </summary>
	internal struct SweepHitHandler : ISweepHitHandler
	{
		private readonly BepuNarrowPhaseCallbacks _callbacks;
		private readonly CollidableUserData _self;
		private readonly CoreBodyHandle _ownBody;
		private readonly bool _hasOwnBody;

		public bool Hit;
		public float T;
		public Vector3 Point;
		public Vector3 Normal;
		public int HitOwnerId;

		public SweepHitHandler( BepuNarrowPhaseCallbacks callbacks, uint layer, uint mask, CoreBodyHandle? ownBody )
		{
			_callbacks = callbacks;
			_self = new CollidableUserData { Layer = layer, Mask = mask };
			_ownBody = ownBody ?? default;
			_hasOwnBody = ownBody.HasValue;
			Hit = false;
			T = 1f;
			Point = default;
			Normal = Vector3.UnitY;
			HitOwnerId = 0;
		}

		public bool AllowTest( CollidableReference collidable )
		{
			if ( _hasOwnBody && collidable.Mobility != CollidableMobility.Static && collidable.BodyHandle.Value == _ownBody.Value )
				return false;

			CollidableUserData other = _callbacks.GetData( collidable );

			if ( other.Kind == PhysicsObjectKind.Trigger )
				return false;

			return _self.CanInteractWith( other );
		}

		public bool AllowTest( CollidableReference collidable, int childIndex ) => true;

		public void OnHit( ref float maximumT, float t, Vector3 hitLocation, Vector3 hitNormal, CollidableReference collidable )
		{
			if ( Hit && t > T )
				return;

			Hit = true;
			T = t;
			Point = hitLocation;
			Normal = hitNormal;
			HitOwnerId = _callbacks.GetData( collidable ).OwnerId;
			maximumT = t;
		}

		public void OnHitAtZeroT( ref float maximumT, CollidableReference collidable )
		{
			// Already overlapping at the start of the sweep (e.g. standing in a tight corner).
			// Treat as an immediate full stop for this iteration.
			Hit = true;
			T = 0f;
			Normal = Vector3.UnitY;
			HitOwnerId = _callbacks.GetData( collidable ).OwnerId;
			maximumT = 0f;
		}
	}
}
