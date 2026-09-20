// Created by Anton Piruev in 2026.
// Any direct commercial use of derivative work is strictly prohibited.

using BepuPhysics;
using BepuPhysics.Collidables;
using BepuUtilities;
using BepuUtilities.Memory;

using Framework.FastMath.Numerics;
using Framework.FastMath.Numerics.Extensions;
using Framework.Physics.Internal;

using System;
using System.Collections.Generic;
using System.Numerics;

namespace Framework.Physics
{
	/// <summary>
	/// Owns and steps a BEPUphysics2 simulation. This is the entire public surface of
	/// Framework.Physics - every method here takes and returns only primitives,
	/// System.Numerics types, and this assembly's own opaque handles/result structs. No
	/// BepuPhysics/BepuUtilities type is ever exposed, so consumers (the Godot-side glue
	/// project) never need a reference to those assemblies, only to this one.
	///
	/// Typical usage from the Godot side, once per physics tick:
	///   List&lt;OverlapEvent&gt; events = world.Step(delta);
	///   foreach (OverlapEvent overlapEvent in events) { ... resolve OwnerIdA/B to Node3D, raise Entered/Exited ... }
	/// </summary>
	public sealed class PhysicsWorld : IDisposable
	{
		private readonly Simulation _simulation;
		private readonly BufferPool _pool;
		private readonly ThreadDispatcher? _dispatcher;
		private readonly CollidableProperty<CollidableUserData> _properties;
		private readonly ContactPairSink _sink;
		private readonly BepuNarrowPhaseCallbacks _callbacks;

		// Per-shape unit-mass inertia factory, keyed by the shape's packed TypedIndex. Only
		// populated for convex shapes (mesh shapes are static-only and never need inertia).
		private readonly Dictionary<uint, Func<float, BodyInertia>> _inertiaFactories =
			new Dictionary<uint, Func<float, BodyInertia>>();

		private Dictionary<ContactPairKey, (uint A, uint B)> _previousOverlaps =
			new Dictionary<ContactPairKey, (uint A, uint B)>();

		public int ThreadCount => _dispatcher?.ThreadCount ?? 1;

		public PhysicsWorld( PhysicsWorldSettings settings )
		{
			_pool = new BufferPool();
			_properties = new CollidableProperty<CollidableUserData>( _pool );
			_sink = new ContactPairSink();

			if ( settings.UseMultithreading )
			{
				int threadCount = FMath.Max( 1, Environment.ProcessorCount - 1 );
				_dispatcher = threadCount > 1 ? new ThreadDispatcher( threadCount ) : null;
			}

			_callbacks = new BepuNarrowPhaseCallbacks(
				_properties,
				_sink,
				settings.FrictionCoefficient,
				settings.MaximumRecoveryVelocity
			);

			_simulation = Simulation.Create(
				_pool,
				_callbacks,
				new BepuPoseIntegratorCallbacks( settings.Gravity ),
				new SolveDescription( settings.VelocityIterations, settings.Substeps )
			);
		}

		public void Dispose()
		{
			_simulation.Dispose();
			_dispatcher?.Dispose();
			_pool.Clear();
		}

		#region Stepping & overlap events

		/// <summary>
		/// Advances the simulation by <paramref name="dt"/> and returns every overlap Entered/Exited
		/// transition detected this step (diffed against the previous step's touching set).
		/// </summary>
		public List<OverlapEvent> Step( float dt )
		{
			bool isSimulationPaused = dt == 0;
			_simulation.Timestep( dt, _dispatcher, isSimulationPaused );

			List<ContactPairKey> drained = _sink.DrainAndReset();

			Dictionary<ContactPairKey, (uint A, uint B)> current =
				new Dictionary<ContactPairKey, (uint A, uint B)>( drained.Count );

			foreach ( ContactPairKey key in drained )
				current[ key ] = (key.PackedA, key.PackedB);

			List<OverlapEvent> events = new List<OverlapEvent>();

			foreach ( KeyValuePair<ContactPairKey, (uint A, uint B)> kvp in current )
				if ( !_previousOverlaps.ContainsKey( kvp.Key ) )
					events.Add( MakeEvent( kvp.Value, entered: true ) );

			foreach ( KeyValuePair<ContactPairKey, (uint A, uint B)> kvp in _previousOverlaps )
				if ( !current.ContainsKey( kvp.Key ) )
					events.Add( MakeEvent( kvp.Value, entered: false ) );

			_previousOverlaps = current;
			return events;
		}

		private OverlapEvent MakeEvent( (uint A, uint B) packed, bool entered )
		{
			CollidableReference refA = default;
			refA.Packed = packed.A;
			CollidableReference refB = default;
			refB.Packed = packed.B;
			return new OverlapEvent(
				_callbacks.GetData( refA ).OwnerId,
				_callbacks.GetData( refB ).OwnerId,
				entered
			);
		}

		#endregion

		#region Shapes

		public ShapeHandle AddBoxShape( Vector3 size )
		{
			Box shape = new Box( size.X, size.Y, size.Z );
			TypedIndex index = _simulation.Shapes.Add( shape );
			_inertiaFactories[ index.Packed ] = ( float mass ) => shape.ComputeInertia( mass );
			return new ShapeHandle( index.Packed );
		}

		public ShapeHandle AddSphereShape( float radius )
		{
			Sphere shape = new Sphere( radius );
			TypedIndex index = _simulation.Shapes.Add( shape );
			_inertiaFactories[ index.Packed ] = ( float mass ) => shape.ComputeInertia( mass );
			return new ShapeHandle( index.Packed );
		}

		/// <summary><paramref name="cylinderLength"/> is the straight segment only (not the total capped length) - convert on the caller's side if your source data uses total height.</summary>
		public ShapeHandle AddCapsuleShape( float radius, float cylinderLength )
		{
			Capsule shape = new Capsule( radius, cylinderLength );
			TypedIndex index = _simulation.Shapes.Add( shape );
			_inertiaFactories[ index.Packed ] = ( float mass ) => shape.ComputeInertia( mass );
			return new ShapeHandle( index.Packed );
		}

		public ShapeHandle AddCylinderShape( float radius, float height )
		{
			Cylinder shape = new Cylinder( radius, height );
			TypedIndex index = _simulation.Shapes.Add( shape );
			_inertiaFactories[ index.Packed ] = ( float mass ) => shape.ComputeInertia( mass );
			return new ShapeHandle( index.Packed );
		}

		/// <summary>
		/// Builds a convex hull from a point cloud (e.g. one map brush's vertices). Bepu
		/// internally re-centers the hull on its own centroid - <paramref name="centroidOffset"/>
		/// is that offset in the input points' local space; add it (rotated by whatever
		/// orientation you place the body at) to the source origin when building the pose, or the
		/// hull will appear shifted relative to whatever you were expecting to align it to.
		/// </summary>
		public ShapeHandle AddConvexHullShape( ReadOnlySpan<Vector3> points, float mass, out Vector3 centroidOffset )
		{
			_pool.Take<Vector3>( points.Length, out Buffer<Vector3> buffer );
			for ( int i = 0; i < points.Length; i++ )
				buffer[ i ] = points[ i ];

			ConvexHullHelper.CreateShape( buffer, _pool, out HullData hullData, out Vector3 center, out ConvexHull hull );
			hullData.Dispose( _pool );
			_pool.Return( ref buffer );

			TypedIndex index = _simulation.Shapes.Add( hull );
			_inertiaFactories[ index.Packed ] = ( float mass2 ) => hull.ComputeInertia( mass2 );
			centroidOffset = center;
			return new ShapeHandle( index.Packed );
		}

		/// <summary>
		/// Builds a static, BVH-accelerated triangle mesh shape from a flat triangle soup
		/// (length must be a multiple of 3). Static-only - do not use with AddDynamicBody.
		/// </summary>
		public ShapeHandle AddTriangleMeshShape( ReadOnlySpan<Vector3> triangleVertices, Vector3 scale )
		{
			if ( triangleVertices.Length % 3 != 0 )
				throw new ArgumentException( "Triangle vertex count must be a multiple of 3.", nameof( triangleVertices ) );

			int triangleCount = triangleVertices.Length / 3;
			_pool.Take<Triangle>( triangleCount, out Buffer<Triangle> triangles );
			for ( int i = 0; i < triangleCount; i++ )
				triangles[ i ] = new Triangle( triangleVertices[ i * 3 ], triangleVertices[ i * 3 + 1 ], triangleVertices[ i * 3 + 2 ] );

			Mesh mesh = new Mesh( triangles, scale, _pool );
			TypedIndex index = _simulation.Shapes.Add( mesh );
			return new ShapeHandle( index.Packed );
			// No inertia factory registered - AddDynamicBody will reject this shape, by design.
		}

		#endregion

		#region Bodies & statics

		public BodyHandle AddDynamicBody(
			PhysicsTransform pose,
			ShapeHandle shape,
			float mass,
			uint layer,
			uint mask,
			int ownerId,
			PhysicsObjectKind kind = PhysicsObjectKind.Solid,
			bool continuousDetection = false
		)
		{
			if ( !_inertiaFactories.TryGetValue(
				shape.Packed,
				out Func<float,
				BodyInertia>? inertiaFactory )
			   )
			{
				throw new InvalidOperationException(
					"This shape does not support dynamic bodies" +
					" (e.g. triangle meshes are static-only)." );
			}

			TypedIndex typedIndex = new TypedIndex { Packed = shape.Packed };

			CollidableDescription collidable = new CollidableDescription(
				typedIndex,
				continuousDetection ?
				ContinuousDetection.Continuous() :
				ContinuousDetection.Discrete
			);

			RigidPose rigidPose = new RigidPose( pose.Position, pose.Orientation );

			BodyDescription description = BodyDescription.CreateDynamic(
				rigidPose,
				inertiaFactory( mass ),
				collidable,
				new BodyActivityDescription( 0.01f )
			);

			BepuPhysics.BodyHandle handle = _simulation.Bodies.Add( description );

			_properties[ handle ] = new CollidableUserData
			{
				Layer = layer,
				Mask = mask,
				Kind = kind,
				OwnerId = ownerId
			};

			return new BodyHandle( handle.Value );
		}

		public BodyHandle AddKinematicBody(
			PhysicsTransform pose,
			ShapeHandle shape,
			uint layer,
			uint mask,
			int physicsId,
			PhysicsObjectKind kind = PhysicsObjectKind.Solid,
			bool continuousDetection = false
		)
		{
			TypedIndex typedIndex = new TypedIndex
			{
				Packed = shape.Packed
			};

			CollidableDescription collidable = new CollidableDescription(
				typedIndex,
				continuousDetection ?
				ContinuousDetection.Continuous() :
				ContinuousDetection.Discrete
			);

			RigidPose rigidPose = new RigidPose( pose.Position, pose.Orientation );

			BodyDescription description = BodyDescription.CreateKinematic(
				rigidPose,
				collidable,
				new BodyActivityDescription( 0.01f )
			);

			BepuPhysics.BodyHandle handle = _simulation.Bodies.Add( description );

			_properties[ handle ] = new CollidableUserData
			{
				Layer = layer,
				Mask = mask,
				Kind = kind,
				OwnerId = physicsId
			};

			return new BodyHandle( handle.Value );
		}

		public StaticHandle AddStatic(
			PhysicsTransform pose,
			ShapeHandle shape,
			uint layer,
			uint mask,
			int ownerId,
			PhysicsObjectKind kind = PhysicsObjectKind.Solid
		)
		{
			TypedIndex typedIndex = new TypedIndex
			{
				Packed = shape.Packed
			};

			RigidPose rigidPose = new RigidPose( pose.Position, pose.Orientation );

			BepuPhysics.StaticHandle handle = _simulation.Statics
				.Add( new StaticDescription( rigidPose, typedIndex ) );

			_properties[ handle ] = new CollidableUserData
			{
				Layer = layer,
				Mask = mask,
				Kind = kind,
				OwnerId = ownerId
			};

			return new StaticHandle( handle.Value );
		}

		public void RemoveBody( BodyHandle handle )
		{
			BepuPhysics.BodyHandle bepuHandle =
				new BepuPhysics.BodyHandle( handle.Value );

			if ( _simulation.Bodies.BodyExists( bepuHandle ) )
				_simulation.Bodies.Remove( bepuHandle );
		}

		public void RemoveStatic( StaticHandle handle )
		{
			BepuPhysics.StaticHandle bepuHandle =
				new BepuPhysics.StaticHandle( handle.Value );

			if ( _simulation.Statics.StaticExists( bepuHandle ) )
				_simulation.Statics.Remove( bepuHandle );
		}

		public bool BodyExists( BodyHandle handle ) =>
			_simulation.Bodies.BodyExists( new BepuPhysics.BodyHandle( handle.Value ) );

		public PhysicsTransform GetBodyPose( BodyHandle handle )
		{
			BodyReference reference = _simulation
				.Bodies
				.GetBodyReference( new BepuPhysics.BodyHandle( handle.Value ) );

			return new PhysicsTransform( reference.Pose.Position, reference.Pose.Orientation );
		}

		public void SetBodyPose( BodyHandle handle, PhysicsTransform pose )
		{
			BodyReference reference = _simulation
				.Bodies
				.GetBodyReference( new BepuPhysics.BodyHandle( handle.Value ) );

			reference.Pose.Position = pose.Position;
			reference.Pose.Orientation = pose.Orientation;
		}

		public void SetAwakeState( BodyHandle handle, bool isAwake )
		{
			BodyReference reference = _simulation
			   .Bodies
			   .GetBodyReference( new BepuPhysics.BodyHandle( handle.Value ) );

			reference.Awake = isAwake;
		}

		public bool GetAwakeState( BodyHandle handle )
		{
			BodyReference reference = _simulation
			   .Bodies
			   .GetBodyReference( new BepuPhysics.BodyHandle( handle.Value ) );

			return reference.Awake;
		}

		public Vector3 GetLinearVelocity( BodyHandle handle ) =>
			_simulation
			.Bodies
			.GetBodyReference( new BepuPhysics.BodyHandle( handle.Value ) )
			.Velocity.Linear;

		public void SetLinearVelocity( BodyHandle handle, Vector3 velocity )
		{
			BodyReference reference = _simulation
				.Bodies
				.GetBodyReference( new BepuPhysics.BodyHandle( handle.Value ) );

			reference.Velocity.Linear = velocity;
		}

		public Vector3 GetAngularVelocity( BodyHandle handle ) =>
			_simulation
			.Bodies
			.GetBodyReference( new BepuPhysics.BodyHandle( handle.Value ) )
			.Velocity.Angular;

		public void SetAngularVelocity( BodyHandle handle, Vector3 angularVelocity )
		{
			BodyReference reference = _simulation
				.Bodies
				.GetBodyReference( new BepuPhysics.BodyHandle( handle.Value ) );

			reference.Velocity.Angular = angularVelocity;
		}

		public void ApplyImpulse(
			BodyHandle handle,
			Vector3 impulse,
			Vector3 worldOffsetFromCenterOfMass
		)
		{
			BodyReference reference = _simulation
				.Bodies
				.GetBodyReference( new BepuPhysics.BodyHandle( handle.Value ) );

			reference.ApplyImpulse( impulse, worldOffsetFromCenterOfMass );
		}

		#endregion

		#region Character movement (collide-and-slide)

		/// <summary>
		/// Sweeps a capsule from <paramref name="position"/> by <paramref name="velocity"/> * dt,
		/// sliding along anything it hits (the standard Quake/Source collide-and-slide algorithm),
		/// then probes straight down to settle floor state. The character's own body
		/// (<paramref name="self"/>) is excluded from the sweep. Purely geometric - does not read
		/// or write the body's solver state; the caller owns Velocity and calls this once per tick.
		/// </summary>
		public CharacterMoveResult MoveCharacter(
			BodyHandle self,
			Vector3 position,
			Vector3 velocity,
			float dt,
			float radius,
			float cylinderLength,
			uint layer,
			uint mask,
			CharacterMoveOptions options
		)
		{
			Capsule shape = new Capsule( radius, cylinderLength );
			float maxFloorDot = FMath.FastCos( options.MaxFloorAngleDegrees * FMath.PI / 180f );

			Vector3 displacement = velocity * dt;
			bool grounded = false;
			Vector3 groundNormal = Vector3.UnitY;
			int groundOwnerId = 0;

			Vector3 finalVelocity = velocity;

			const int maxClipPlanes = 5;
			Span<Vector3> planes = stackalloc Vector3[ maxClipPlanes ];
			int numPlanes = 0;

			if ( displacement.LengthSq() > 1e-10f )
				planes[ numPlanes++ ] = displacement.FastNormalized();

			for ( int iteration = 0; iteration < options.MaxSlideIterations; iteration++ )
			{
				if ( displacement.LengthSq() < 1e-10f )
					break;

				SweepHitHandler hit = SweepOnce(
					shape,
					position,
					displacement,
					layer,
					mask,
					self
				);

				if ( !hit.Hit )
				{
					position += displacement;
					displacement = Vector3.Zero;
					break;
				}

				float distance = displacement.FastLength();

				float travelFraction =
					distance > 0f
					? FMath.Max( 0f, hit.T - options.SkinWidth / distance )
					: 0f;

				position += displacement * travelFraction;

				// Prevent starting the next sweep already intersecting the same surface.
				position += hit.Normal * options.SkinWidth;

				Vector3 remaining = displacement - displacement * travelFraction;

				if ( hit.Normal.FastDot( Vector3.UnitY ) >= maxFloorDot )
				{
					grounded = true;
					groundNormal = hit.Normal;
					groundOwnerId = hit.HitOwnerId;
				}

				if ( numPlanes >= maxClipPlanes )
				{
					displacement = Vector3.Zero;
					finalVelocity = Vector3.Zero;
					break;
				}

				bool samePlane = false;

				for ( int i = 0; i < numPlanes; i++ )
				{
					if ( hit.Normal.FastDot( planes[ i ] ) > 0.995f )
					{
						remaining += hit.Normal * ( options.SkinWidth * 2f );
						samePlane = true;
						break;
					}
				}

				if ( samePlane )
				{
					displacement = remaining;
					finalVelocity = ClipToPlanes(
						finalVelocity,
						planes,
						numPlanes
					);

					continue;
				}

				planes[ numPlanes++ ] = hit.Normal;

				displacement = ClipToPlanes(
					remaining,
					planes,
					numPlanes
				);

				finalVelocity = ClipToPlanes(
					finalVelocity,
					planes,
					numPlanes
				);
			}

			if ( !grounded )
			{
				SweepHitHandler probe = SweepOnce(
					shape,
					position,
					-Vector3.UnitY * options.FloorProbeDistance,
					layer,
					mask,
					self
				);

				if ( probe.Hit &&
					 probe.Normal.FastDot( Vector3.UnitY ) >= maxFloorDot )
				{
					grounded = true;
					groundNormal = probe.Normal;
					groundOwnerId = probe.HitOwnerId;
				}
			}

			return new CharacterMoveResult(
				position,
				grounded,
				groundNormal,
				groundOwnerId,
				finalVelocity
			);
		}

		/// <summary>
		/// Resolves <paramref name="velocity"/> against every plane touched so far this move.
		/// Direct port of the plane-clipping loop in idPhysics_Player::SlideMove
		/// (Physics_Player.cpp lines 337-404): find a plane the move still runs into, project
		/// onto it, and if a second already-touched plane objects to the result, slide along
		/// the crease line where the two planes meet instead (the fix for corner-catching).
		/// If a third plane also objects to the crease direction, it's a genuine pocket -
		/// stop dead rather than oscillate.
		/// </summary>
		private static Vector3 ClipToPlanes( Vector3 velocity, Span<Vector3> planes, int numPlanes )
		{
			const float overclip = 1.001f; // OVERCLIP in the original
			const float epsilon = 1e-4f;   // stand-in for the original's 0.1 units/sec threshold

			for ( int i = 0; i < numPlanes; i++ )
			{
				float into = velocity.FastDot( planes[ i ] );
				if ( into >= epsilon )
					continue; // move doesn't interact with this plane

				Vector3 clipped = velocity - planes[ i ] * ( into * overclip );

				for ( int j = 0; j < numPlanes; j++ )
				{
					if ( j == i )
						continue;

					float intoJ = clipped.FastDot( planes[ j ] );
					if ( intoJ >= epsilon )
						continue; // doesn't also interact with plane j

					clipped -= planes[ j ] * ( intoJ * overclip );

					if ( clipped.FastDot( planes[ i ] ) >= 0f )
						continue; // fixed without needing the crease

					// two planes both object - slide along the line where they meet
					Vector3 dir = planes[ i ].FastCross( planes[ j ] );
					if ( dir.LengthSq() < 1e-10f )
						return Vector3.Zero; // near-parallel planes, no clean crease - bail

					dir = dir.FastNormalized();
					clipped = dir * dir.FastDot( velocity );

					for ( int k = 0; k < numPlanes; k++ )
					{
						if ( k == i || k == j )
							continue;

						if ( clipped.FastDot( planes[ k ] ) >= epsilon )
							continue;

						// a third plane also objects to the crease direction: dead stop
						// (Physics_Player.cpp lines 394-396)
						return Vector3.Zero;
					}
				}

				if ( clipped.LengthSq() < 1e-6f )
					return Vector3.Zero;

				return clipped;
			}

			if ( velocity.LengthSq() < 1e-6f )
				return Vector3.Zero;

			return velocity;
		}

		private SweepHitHandler SweepOnce(
			Capsule shape,
			Vector3 position,
			Vector3 displacement,
			uint layer,
			uint mask,
			BodyHandle? self
		)
		{
			SweepHitHandler hitHandler = new SweepHitHandler( _callbacks, layer, mask, self );
			RigidPose pose = new RigidPose( position, Quaternion.Identity );
			BodyVelocity sweepVelocity = new BodyVelocity { Linear = displacement };
			_simulation.Sweep( shape, pose, sweepVelocity, 1f, _pool, ref hitHandler );
			return hitHandler;
		}

		#endregion

		#region Projectiles

		/// <summary>
		/// Sweeps a sphere from <paramref name="position"/> by <paramref name="velocity"/> * dt and
		/// reports the first thing it touches, if anything - no tunneling regardless of speed,
		/// because the sweep itself is the movement rather than a discrete step-then-check. Does
		/// not modify any body state; the caller decides what to do with the result (move the
		/// node, destroy the projectile, etc).
		/// </summary>
		public ProjectileSweepResult SweepProjectile(
			BodyHandle self,
			Vector3 position,
			Vector3 velocity,
			float dt,
			float radius,
			uint layer,
			uint mask
		)
		{
			Sphere shape = new Sphere( radius );
			Vector3 displacement = velocity * dt;

			SweepHitHandler hitHandler = new SweepHitHandler( _callbacks, layer, mask, self );
			RigidPose pose = new RigidPose( position, Quaternion.Identity );
			BodyVelocity sweepVelocity = new BodyVelocity { Linear = displacement };
			_simulation.Sweep( shape, pose, sweepVelocity, 1f, _pool, ref hitHandler );

			if ( hitHandler.Hit )
			{
				Vector3 hitPosition = position + displacement * hitHandler.T;
				return new ProjectileSweepResult(
					true,
					hitPosition,
					hitHandler.Point,
					hitHandler.Normal,
					hitHandler.HitOwnerId
				);
			}

			return new ProjectileSweepResult( false, position + displacement, default, Vector3.UnitY, 0 );
		}

		#endregion

		#region Generic queries

		/// <summary>
		/// Sweeps a sphere from <paramref name="origin"/> towards <paramref name="direction"/> (need
		/// not be normalized) up to <paramref name="maxDistance"/> and reports the first thing it
		/// touches, if anything. Unlike <see cref="MoveCharacter"/> and <see cref="SweepProjectile"/>,
		/// this isn't tied to any registered body - it's a one-off query, e.g. for a camera boom /
		/// SpringArm-style collision check. Pass <paramref name="exclude"/> to ignore a specific
		/// body (typically whatever the boom is attached to, so it doesn't immediately hit itself).
		/// </summary>
		public ShapeCastResult SweepSphereCast(
			Vector3 origin,
			Vector3 direction,
			float maxDistance,
			float radius,
			uint layer,
			uint mask,
			BodyHandle? exclude = null
		)
		{
			if ( maxDistance <= 0f || direction.LengthSq() < 1e-12f )
				return new ShapeCastResult( false, origin, default, Vector3.UnitY, 0f, 0 );

			Vector3 displacement = direction.FastNormalized() * maxDistance;

			Sphere shape = new Sphere( radius );
			SweepHitHandler hitHandler = new SweepHitHandler( _callbacks, layer, mask, exclude );
			RigidPose pose = new RigidPose( origin, Quaternion.Identity );
			BodyVelocity sweepVelocity = new BodyVelocity { Linear = displacement };
			_simulation.Sweep( shape, pose, sweepVelocity, 1f, _pool, ref hitHandler );

			if ( hitHandler.Hit )
			{
				float distance = maxDistance * hitHandler.T;
				Vector3 stopPosition = origin + displacement * hitHandler.T;
				return new ShapeCastResult(
					true,
					stopPosition,
					hitHandler.Point,
					hitHandler.Normal,
					distance,
					hitHandler.HitOwnerId
				);
			}

			return new ShapeCastResult(
				false,
				origin + displacement,
				default,
				Vector3.UnitY,
				maxDistance, 0
			);
		}

		#endregion
	}
}