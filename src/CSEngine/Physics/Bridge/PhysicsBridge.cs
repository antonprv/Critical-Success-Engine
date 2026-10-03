// Created by Anton Piruev in 2026.
// Any direct commercial use of derivative work is strictly prohibited.

using System.Numerics;
using System.Runtime.InteropServices.JavaScript;
using System.Runtime.Versioning;

namespace Physics.Wasm
{
	/// <summary>
	/// The entire JS-facing surface of the physics simulation. Mirrors
	/// <see cref="PhysicsWorld"/>'s own "opaque handles + primitives only" design one level
	/// further out: every handle here is a plain <c>int</c> id minted by this class (never a
	/// raw Bepu or Physics handle value), and every shape/pose parameter is
	/// individual doubles rather than a struct, because that's what the built-in JSExport
	/// marshaler understands without any custom interop glue. Variable-length data (point clouds,
	/// triangle soups) crosses as a flat <c>double[]</c> [x0,y0,z0,x1,y1,z1,...] marked with
	/// <see cref="JSMarshalAs{T}"/>, and every multi-value result comes back as a flat
	/// <c>double[]</c> whose layout is documented on the method.
	///
	/// The whole <see cref="PhysicsWorld"/> API is exposed here - there is deliberately nothing left that
	/// only the desktop (Godot) build can call. TypeScript mirrors this surface 1:1 in
	/// PhysicsBridgeContract.ts, and everything above it (command batching, entity ids,
	/// character carry, snapshots) lives in TypeScript - this file stays a thin marshalling layer.
	///
	/// Intended caller: PhysicsWorker.ts, once per fixed-timestep tick:
	///   const packed = PhysicsBridge.Step(dt);               // Float64 stride StepStride (14) per body
	///   const events = PhysicsBridge.GetLastOverlapEvents(); // Int32 stride 3 per event
	/// </summary>
	public static partial class PhysicsBridge
	{
		/// <summary>Doubles per body in <see cref="Step"/>'s result: [bodyId, pos(3), quat(4), linearVelocity(3), angularVelocity(3)].</summary>
		public const int StepStride = 14;

		private static PhysicsWorld? _world;

		private static readonly Dictionary<int, ShapeHandle> _shapes = new();
		private static readonly Dictionary<int, BodyHandle> _bodies = new();
		private static readonly Dictionary<int, StaticHandle> _statics = new();

		private static int _nextShapeId = 1;
		private static int _nextBodyId = 1;
		private static int _nextStaticId = 1;

		private static List<OverlapEvent> _lastEvents = new();

		#region World lifecycle

		[SupportedOSPlatform( "browser" )]
		[JSExport]
		public static void CreateWorld(
			double gravityX, double gravityY, double gravityZ,
			int velocityIterations,
			int substeps,
			bool useMultithreading,
			double frictionCoefficient,
			double maximumRecoveryVelocity
		)
		{
			_world?.Dispose();

			// See Bridge.csproj's WasmEnableThreads note: this build only ever runs on
			// one thread, so useMultithreading is accepted for API parity with the desktop
			// PhysicsWorldSettings but forced off here rather than trusted from the caller.
			PhysicsWorldSettings settings = new PhysicsWorldSettings(
				new Vector3( (float)gravityX, (float)gravityY, (float)gravityZ ),
				velocityIterations,
				substeps,
				useMultithreading: false,
				frictionCoefficient: (float)frictionCoefficient,
				maximumRecoveryVelocity: (float)maximumRecoveryVelocity
			);

			_world = new PhysicsWorld( settings );
			_shapes.Clear();
			_bodies.Clear();
			_statics.Clear();
			_nextShapeId = 1;
			_nextBodyId = 1;
			_nextStaticId = 1;
			_lastEvents.Clear();
		}

		[SupportedOSPlatform( "browser" )]
		[JSExport]
		public static void DestroyWorld()
		{
			_world?.Dispose();
			_world = null;
		}

		#endregion

		#region Shapes

		[SupportedOSPlatform( "browser" )]
		[JSExport]
		public static int AddBoxShape( double sizeX, double sizeY, double sizeZ )
		{
			int id = _nextShapeId++;
			_shapes[ id ] = World.AddBoxShape( new Vector3( (float)sizeX, (float)sizeY, (float)sizeZ ) );
			return id;
		}

		[SupportedOSPlatform( "browser" )]
		[JSExport]
		public static int AddSphereShape( double radius )
		{
			int id = _nextShapeId++;
			_shapes[ id ] = World.AddSphereShape( (float)radius );
			return id;
		}

		/// <summary><paramref name="cylinderLength"/> is the straight segment only, not the total capped length - matches PhysicsWorld.AddCapsuleShape.</summary>
		[SupportedOSPlatform( "browser" )]
		[JSExport]
		public static int AddCapsuleShape( double radius, double cylinderLength )
		{
			int id = _nextShapeId++;
			_shapes[ id ] = World.AddCapsuleShape( (float)radius, (float)cylinderLength );
			return id;
		}

		[SupportedOSPlatform( "browser" )]
		[JSExport]
		public static int AddCylinderShape( double radius, double height )
		{
			int id = _nextShapeId++;
			_shapes[ id ] = World.AddCylinderShape( (float)radius, (float)height );
			return id;
		}

		/// <summary>
		/// Builds a convex hull from a flat point cloud [x0,y0,z0,x1,...]. Returns
		/// [shapeId, centroidOffsetX, centroidOffsetY, centroidOffsetZ]: Bepu re-centres the hull on its own centroid, and
		/// the offset (in the input points' local space) must be added - rotated by the body's orientation - to the
		/// source origin when building the pose, or the hull appears shifted. PhysicsWorld.ts does that for you.
		/// </summary>
		[SupportedOSPlatform( "browser" )]
		[JSExport]
		[return: JSMarshalAs<JSType.Array<JSType.Number>>]
		public static double[] AddConvexHullShape(
			[JSMarshalAs<JSType.Array<JSType.Number>>] double[] points,
			double mass
		)
		{
			Vector3[] vectors = ToVectors( points );
			ShapeHandle handle = World.AddConvexHullShape( vectors, (float)mass, out Vector3 centroidOffset );

			int id = _nextShapeId++;
			_shapes[ id ] = handle;
			return new double[] { id, centroidOffset.X, centroidOffset.Y, centroidOffset.Z };
		}

		/// <summary>
		/// Builds a static, BVH-accelerated triangle mesh from a flat triangle soup (vertex count must be a multiple of 3,
		/// i.e. the array length a multiple of 9). Static-only - never pass the resulting shape to AddDynamicBody.
		/// </summary>
		[SupportedOSPlatform( "browser" )]
		[JSExport]
		public static int AddTriangleMeshShape(
			[JSMarshalAs<JSType.Array<JSType.Number>>] double[] triangleVertices,
			double scaleX, double scaleY, double scaleZ
		)
		{
			Vector3[] vectors = ToVectors( triangleVertices );
			ShapeHandle handle = World.AddTriangleMeshShape( vectors, new Vector3( (float)scaleX, (float)scaleY, (float)scaleZ ) );

			int id = _nextShapeId++;
			_shapes[ id ] = handle;
			return id;
		}

		#endregion

		#region Bodies & statics

		/// <param name="kind">PhysicsObjectKind as int: 0 Solid, 1 Character, 2 Trigger, 3 Projectile.</param>
		[SupportedOSPlatform( "browser" )]
		[JSExport]
		public static int AddDynamicBody(
			int shapeId,
			double posX, double posY, double posZ,
			double quatX, double quatY, double quatZ, double quatW,
			double mass,
			int layer, int mask, int ownerId,
			int kind,
			bool continuousDetection
		)
		{
			PhysicsTransform pose = MakeTransform( posX, posY, posZ, quatX, quatY, quatZ, quatW );
			BodyHandle handle = World.AddDynamicBody(
				pose, _shapes[ shapeId ], (float)mass, (uint)layer, (uint)mask, ownerId,
				(PhysicsObjectKind)kind, continuousDetection
			);

			int id = _nextBodyId++;
			_bodies[ id ] = handle;
			return id;
		}

		/// <param name="kind">PhysicsObjectKind as int: 0 Solid, 1 Character, 2 Trigger, 3 Projectile.</param>
		[SupportedOSPlatform( "browser" )]
		[JSExport]
		public static int AddKinematicBody(
			int shapeId,
			double posX, double posY, double posZ,
			double quatX, double quatY, double quatZ, double quatW,
			int layer, int mask, int ownerId,
			int kind
		)
		{
			PhysicsTransform pose = MakeTransform( posX, posY, posZ, quatX, quatY, quatZ, quatW );
			BodyHandle handle = World.AddKinematicBody(
				pose, _shapes[ shapeId ], (uint)layer, (uint)mask, ownerId, (PhysicsObjectKind)kind
			);

			int id = _nextBodyId++;
			_bodies[ id ] = handle;
			return id;
		}

		/// <param name="kind">PhysicsObjectKind as int: pass 2 (Trigger) for non-solid static sensor volumes.</param>
		[SupportedOSPlatform( "browser" )]
		[JSExport]
		public static int AddStaticBody(
			int shapeId,
			double posX, double posY, double posZ,
			double quatX, double quatY, double quatZ, double quatW,
			int layer, int mask, int ownerId,
			int kind
		)
		{
			PhysicsTransform pose = MakeTransform( posX, posY, posZ, quatX, quatY, quatZ, quatW );
			StaticHandle handle = World.AddStatic( pose, _shapes[ shapeId ], (uint)layer, (uint)mask, ownerId, (PhysicsObjectKind)kind );

			int id = _nextStaticId++;
			_statics[ id ] = handle;
			return id;
		}

		[SupportedOSPlatform( "browser" )]
		[JSExport]
		public static void RemoveBody( int bodyId )
		{
			if ( _bodies.Remove( bodyId, out BodyHandle handle ) )
				World.RemoveBody( handle );
		}

		[SupportedOSPlatform( "browser" )]
		[JSExport]
		public static void RemoveStatic( int staticId )
		{
			if ( _statics.Remove( staticId, out StaticHandle handle ) )
				World.RemoveStatic( handle );
		}

		[SupportedOSPlatform( "browser" )]
		[JSExport]
		public static bool BodyExists( int bodyId ) =>
			_bodies.TryGetValue( bodyId, out BodyHandle handle ) && World.BodyExists( handle );

		/// <summary>Returns [posX, posY, posZ, quatX, quatY, quatZ, quatW].</summary>
		[SupportedOSPlatform( "browser" )]
		[JSExport]
		[return: JSMarshalAs<JSType.Array<JSType.Number>>]
		public static double[] GetBodyPose( int bodyId )
		{
			PhysicsTransform pose = World.GetBodyPose( _bodies[ bodyId ] );
			return new double[]
			{
				pose.Position.X, pose.Position.Y, pose.Position.Z,
				pose.Orientation.X, pose.Orientation.Y, pose.Orientation.Z, pose.Orientation.W,
			};
		}

		[SupportedOSPlatform( "browser" )]
		[JSExport]
		public static void SetBodyPose(
			int bodyId,
			double posX, double posY, double posZ,
			double quatX, double quatY, double quatZ, double quatW
		)
		{
			World.SetBodyPose( _bodies[ bodyId ], MakeTransform( posX, posY, posZ, quatX, quatY, quatZ, quatW ) );
		}

		[SupportedOSPlatform( "browser" )]
		[JSExport]
		public static void SetAwakeState( int bodyId, bool isAwake ) =>
			World.SetAwakeState( _bodies[ bodyId ], isAwake );

		[SupportedOSPlatform( "browser" )]
		[JSExport]
		public static bool GetAwakeState( int bodyId ) =>
			World.GetAwakeState( _bodies[ bodyId ] );

		/// <summary>Returns [x, y, z].</summary>
		[SupportedOSPlatform( "browser" )]
		[JSExport]
		[return: JSMarshalAs<JSType.Array<JSType.Number>>]
		public static double[] GetLinearVelocity( int bodyId )
		{
			Vector3 velocity = World.GetLinearVelocity( _bodies[ bodyId ] );
			return new double[] { velocity.X, velocity.Y, velocity.Z };
		}

		[SupportedOSPlatform( "browser" )]
		[JSExport]
		public static void SetLinearVelocity( int bodyId, double x, double y, double z ) =>
			World.SetLinearVelocity( _bodies[ bodyId ], new Vector3( (float)x, (float)y, (float)z ) );

		/// <summary>Returns [x, y, z].</summary>
		[SupportedOSPlatform( "browser" )]
		[JSExport]
		[return: JSMarshalAs<JSType.Array<JSType.Number>>]
		public static double[] GetAngularVelocity( int bodyId )
		{
			Vector3 velocity = World.GetAngularVelocity( _bodies[ bodyId ] );
			return new double[] { velocity.X, velocity.Y, velocity.Z };
		}

		[SupportedOSPlatform( "browser" )]
		[JSExport]
		public static void SetAngularVelocity( int bodyId, double x, double y, double z ) =>
			World.SetAngularVelocity( _bodies[ bodyId ], new Vector3( (float)x, (float)y, (float)z ) );

		[SupportedOSPlatform( "browser" )]
		[JSExport]
		public static void ApplyImpulse(
			int bodyId,
			double impulseX, double impulseY, double impulseZ,
			double offsetX, double offsetY, double offsetZ
		)
		{
			World.ApplyImpulse(
				_bodies[ bodyId ],
				new Vector3( (float)impulseX, (float)impulseY, (float)impulseZ ),
				new Vector3( (float)offsetX, (float)offsetY, (float)offsetZ )
			);
		}

		#endregion

		#region Character movement & sweeps

		/// <summary>
		/// One collide-and-slide move of a kinematic capsule. Purely geometric - the caller owns position/velocity and
		/// calls this once per tick (see CharacterSimulation in PhysicsWorld.ts, which also does the moving-platform carry).
		/// Returns [posX, posY, posZ, isOnFloor(0/1), floorNormalX, floorNormalY, floorNormalZ,
		/// groundOwnerId, velX, velY, velZ] - one CharacterMoveResult flattened to 11 doubles.
		/// </summary>
		[SupportedOSPlatform( "browser" )]
		[JSExport]
		[return: JSMarshalAs<JSType.Array<JSType.Number>>]
		public static double[] MoveCharacter(
			int selfBodyId,
			double posX, double posY, double posZ,
			double velX, double velY, double velZ,
			double dt,
			double radius, double cylinderLength,
			int layer, int mask,
			int maxSlideIterations,
			double skinWidth,
			double maxFloorAngleDegrees,
			double floorProbeDistance
		)
		{
			CharacterMoveOptions options = new CharacterMoveOptions(
				maxSlideIterations,
				(float)skinWidth,
				(float)maxFloorAngleDegrees,
				(float)floorProbeDistance
			);

			CharacterMoveResult result = World.MoveCharacter(
				_bodies[ selfBodyId ],
				new Vector3( (float)posX, (float)posY, (float)posZ ),
				new Vector3( (float)velX, (float)velY, (float)velZ ),
				(float)dt,
				(float)radius, (float)cylinderLength,
				(uint)layer, (uint)mask,
				options
			);

			return new double[]
			{
				result.Position.X, result.Position.Y, result.Position.Z,
				result.IsOnFloor ? 1 : 0,
				result.FloorNormal.X, result.FloorNormal.Y, result.FloorNormal.Z,
				result.GroundOwnerId,
				result.Velocity.X, result.Velocity.Y, result.Velocity.Z,
			};
		}

		/// <summary>
		/// Sweeps a sphere by velocity * dt and reports the first thing it touches (no tunnelling at any speed).
		/// Does not move any body. Returns [hit(0/1), posX, posY, posZ, pointX, pointY, pointZ,
		/// normalX, normalY, normalZ, hitOwnerId].
		/// </summary>
		[SupportedOSPlatform( "browser" )]
		[JSExport]
		[return: JSMarshalAs<JSType.Array<JSType.Number>>]
		public static double[] SweepProjectile(
			int selfBodyId,
			double posX, double posY, double posZ,
			double velX, double velY, double velZ,
			double dt,
			double radius,
			int layer, int mask
		)
		{
			ProjectileSweepResult result = World.SweepProjectile(
				_bodies[ selfBodyId ],
				new Vector3( (float)posX, (float)posY, (float)posZ ),
				new Vector3( (float)velX, (float)velY, (float)velZ ),
				(float)dt,
				(float)radius,
				(uint)layer, (uint)mask
			);

			return new double[]
			{
				result.Hit ? 1 : 0,
				result.Position.X, result.Position.Y, result.Position.Z,
				result.Point.X, result.Point.Y, result.Point.Z,
				result.Normal.X, result.Normal.Y, result.Normal.Z,
				result.HitOwnerId,
			};
		}

		/// <summary>
		/// One-off sphere sweep, not tied to any registered body (camera booms, ground probes...).
		/// <paramref name="excludeBodyId"/> 0 means "exclude nothing" (body ids start at 1).
		/// Returns [hit(0/1), posX, posY, posZ, pointX, pointY, pointZ, normalX, normalY, normalZ, distance, hitOwnerId].
		/// </summary>
		[SupportedOSPlatform( "browser" )]
		[JSExport]
		[return: JSMarshalAs<JSType.Array<JSType.Number>>]
		public static double[] SweepSphereCast(
			double originX, double originY, double originZ,
			double dirX, double dirY, double dirZ,
			double maxDistance,
			double radius,
			int layer, int mask,
			int excludeBodyId
		)
		{
			BodyHandle? exclude = excludeBodyId != 0 && _bodies.TryGetValue( excludeBodyId, out BodyHandle handle )
				? handle
				: null;

			ShapeCastResult result = World.SweepSphereCast(
				new Vector3( (float)originX, (float)originY, (float)originZ ),
				new Vector3( (float)dirX, (float)dirY, (float)dirZ ),
				(float)maxDistance,
				(float)radius,
				(uint)layer, (uint)mask,
				exclude
			);

			return new double[]
			{
				result.Hit ? 1 : 0,
				result.Position.X, result.Position.Y, result.Position.Z,
				result.Point.X, result.Point.Y, result.Point.Z,
				result.Normal.X, result.Normal.Y, result.Normal.Z,
				result.Distance,
				result.HitOwnerId,
			};
		}

		#endregion

		#region Stepping

		/// <summary>
		/// Advances the simulation and returns every dynamic/kinematic body's fresh state as a flat buffer:
		/// [bodyId, posX, posY, posZ, quatX, quatY, quatZ, quatW, linVelX, linVelY, linVelZ, angVelX, angVelY, angVelZ]
		/// (<see cref="StepStride"/> doubles) repeated once per body currently registered, in unspecified order.
		/// Call GetLastOverlapEvents() immediately after to read this same step's Entered/Exited transitions.
		/// </summary>
		[SupportedOSPlatform( "browser" )]
		[JSExport]
		[return: JSMarshalAs<JSType.Array<JSType.Number>>]
		public static double[] Step( double dt )
		{
			_lastEvents = World.Step( (float)dt );

			double[] snapshot = new double[ _bodies.Count * StepStride ];
			int i = 0;
			foreach ( KeyValuePair<int, BodyHandle> entry in _bodies )
			{
				if ( !World.BodyExists( entry.Value ) )
					continue;

				PhysicsTransform pose = World.GetBodyPose( entry.Value );
				Vector3 linear = World.GetLinearVelocity( entry.Value );
				Vector3 angular = World.GetAngularVelocity( entry.Value );

				snapshot[ i++ ] = entry.Key;
				snapshot[ i++ ] = pose.Position.X;
				snapshot[ i++ ] = pose.Position.Y;
				snapshot[ i++ ] = pose.Position.Z;
				snapshot[ i++ ] = pose.Orientation.X;
				snapshot[ i++ ] = pose.Orientation.Y;
				snapshot[ i++ ] = pose.Orientation.Z;
				snapshot[ i++ ] = pose.Orientation.W;
				snapshot[ i++ ] = linear.X;
				snapshot[ i++ ] = linear.Y;
				snapshot[ i++ ] = linear.Z;
				snapshot[ i++ ] = angular.X;
				snapshot[ i++ ] = angular.Y;
				snapshot[ i++ ] = angular.Z;
			}

			// A body that stopped existing mid-loop would leave trailing zeros; trim defensively so the JS
			// side's `length / StepStride` body count is always exact.
			return i == snapshot.Length ? snapshot : snapshot[ ..i ];
		}

		/// <summary>Flat buffer from the most recent Step(): [ownerIdA, ownerIdB, entered(0/1)] per event.</summary>
		[SupportedOSPlatform( "browser" )]
		[JSExport]
		[return: JSMarshalAs<JSType.Array<JSType.Number>>]
		public static int[] GetLastOverlapEvents()
		{
			int[] events = new int[ _lastEvents.Count * 3 ];
			int i = 0;
			foreach ( OverlapEvent overlapEvent in _lastEvents )
			{
				events[ i++ ] = overlapEvent.OwnerIdA;
				events[ i++ ] = overlapEvent.OwnerIdB;
				events[ i++ ] = overlapEvent.Entered ? 1 : 0;
			}
			return events;
		}

		#endregion

		#region Helpers

		private static PhysicsWorld World =>
			_world ?? throw new InvalidOperationException(
				"PhysicsBridge.CreateWorld must be called before any other PhysicsBridge method." );

		private static PhysicsTransform MakeTransform(
			double posX, double posY, double posZ,
			double quatX, double quatY, double quatZ, double quatW
		) => new PhysicsTransform(
			new Vector3( (float)posX, (float)posY, (float)posZ ),
			new Quaternion( (float)quatX, (float)quatY, (float)quatZ, (float)quatW )
		);

		/// <summary>Flat [x0,y0,z0,x1,y1,z1,...] -> Vector3[]. A length that isn't a multiple of 3 is a caller bug, not something to guess around.</summary>
		private static Vector3[] ToVectors( double[] flat )
		{
			if ( flat.Length % 3 != 0 )
				throw new ArgumentException( "Flat vector array length must be a multiple of 3.", nameof( flat ) );

			Vector3[] vectors = new Vector3[ flat.Length / 3 ];
			for ( int i = 0; i < vectors.Length; i++ )
				vectors[ i ] = new Vector3( (float)flat[ i * 3 ], (float)flat[ i * 3 + 1 ], (float)flat[ i * 3 + 2 ] );
			return vectors;
		}

		#endregion
	}
}
