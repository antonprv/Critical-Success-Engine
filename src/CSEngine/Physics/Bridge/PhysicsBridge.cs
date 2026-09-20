// Created by Anton Piruev in 2026.
// Any direct commercial use of derivative work is strictly prohibited.

using System.Numerics;
using System.Runtime.InteropServices.JavaScript;
using System.Runtime.Versioning;

namespace Framework.Physics.Wasm
{
	/// <summary>
	/// The entire JS-facing surface of the physics simulation. Mirrors
	/// <see cref="PhysicsWorld"/>'s own "opaque handles + primitives only" design one level
	/// further out: every handle here is a plain <c>int</c> id minted by this class (never a
	/// raw Bepu or Framework.Physics handle value), and every shape/pose parameter is
	/// individual doubles rather than a struct, because that's what the built-in JSExport
	/// marshaler understands without any custom interop glue.
	///
	/// Intended caller: physics.worker.ts, once per fixed-timestep tick:
	///   const packed = PhysicsBridge.Step(dt);         // Float64Array, 8 doubles per body
	///   const events = PhysicsBridge.GetLastOverlapEvents(); // Int32Array, 3 ints per event
	///
	/// Not yet ported (same pattern, just not wired up - see BUILD.md "Extending the bridge"):
	/// AddConvexHullShape, AddTriangleMeshShape, SweepProjectile, SweepSphereCast. Their
	/// PhysicsWorld methods take ReadOnlySpan&lt;Vector3&gt;, which needs an explicit
	/// [JSMarshalAs&lt;JSType.Array&lt;JSType.Number&gt;&gt;] double[] parameter instead - flatten
	/// [x0,y0,z0,x1,y1,z1,...] on the JS side and rebuild the span here, same as everything
	/// below already does for single vectors/quaternions.
	/// </summary>
	public static partial class PhysicsBridge
	{
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
			bool useMultithreading
		)
		{
			_world?.Dispose();

			// See PhysicsBridge.csproj's WasmEnableThreads note: this build only ever runs on
			// one thread, so useMultithreading is accepted for API parity with the desktop
			// PhysicsWorldSettings but forced off here rather than trusted from the caller.
			PhysicsWorldSettings settings = new PhysicsWorldSettings(
				new Vector3((float)gravityX, (float)gravityY, (float)gravityZ),
				velocityIterations,
				substeps,
				useMultithreading: false
			);

			_world = new PhysicsWorld(settings);
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
		public static int AddBoxShape(double sizeX, double sizeY, double sizeZ)
		{
			int id = _nextShapeId++;
			_shapes[id] = World.AddBoxShape(new Vector3((float)sizeX, (float)sizeY, (float)sizeZ));
			return id;
		}

		[SupportedOSPlatform( "browser" )]
		[JSExport]
		public static int AddSphereShape(double radius)
		{
			int id = _nextShapeId++;
			_shapes[id] = World.AddSphereShape((float)radius);
			return id;
		}

		/// <summary><paramref name="cylinderLength"/> is the straight segment only, not the total capped length - matches PhysicsWorld.AddCapsuleShape.</summary>
		[SupportedOSPlatform( "browser" )]
		[JSExport]
		public static int AddCapsuleShape(double radius, double cylinderLength)
		{
			int id = _nextShapeId++;
			_shapes[id] = World.AddCapsuleShape((float)radius, (float)cylinderLength);
			return id;
		}

		[SupportedOSPlatform( "browser" )]
		[JSExport]
		public static int AddCylinderShape(double radius, double height)
		{
			int id = _nextShapeId++;
			_shapes[id] = World.AddCylinderShape((float)radius, (float)height);
			return id;
		}

		#endregion

		#region Bodies & statics

		[SupportedOSPlatform( "browser" )]
		[JSExport]
		public static int AddDynamicBody(
			int shapeId,
			double posX, double posY, double posZ,
			double quatX, double quatY, double quatZ, double quatW,
			double mass,
			int layer, int mask, int ownerId,
			bool continuousDetection
		)
		{
			PhysicsTransform pose = MakeTransform(posX, posY, posZ, quatX, quatY, quatZ, quatW);
			BodyHandle handle = World.AddDynamicBody(
				pose, _shapes[shapeId], (float)mass, (uint)layer, (uint)mask, ownerId,
				PhysicsObjectKind.Solid, continuousDetection
			);

			int id = _nextBodyId++;
			_bodies[id] = handle;
			return id;
		}

		[SupportedOSPlatform( "browser" )]
		[JSExport]
		public static int AddKinematicBody(
			int shapeId,
			double posX, double posY, double posZ,
			double quatX, double quatY, double quatZ, double quatW,
			int layer, int mask, int ownerId,
			int kind // maps to PhysicsObjectKind - JS passes e.g. 1 for Character, 2 for Trigger
		)
		{
			PhysicsTransform pose = MakeTransform(posX, posY, posZ, quatX, quatY, quatZ, quatW);
			BodyHandle handle = World.AddKinematicBody(
				pose, _shapes[shapeId], (uint)layer, (uint)mask, ownerId, (PhysicsObjectKind)kind
			);

			int id = _nextBodyId++;
			_bodies[id] = handle;
			return id;
		}

		[SupportedOSPlatform( "browser" )]
		[JSExport]
		public static int AddStaticBody(
			int shapeId,
			double posX, double posY, double posZ,
			double quatX, double quatY, double quatZ, double quatW,
			int layer, int mask, int ownerId
		)
		{
			PhysicsTransform pose = MakeTransform(posX, posY, posZ, quatX, quatY, quatZ, quatW);
			StaticHandle handle = World.AddStatic(pose, _shapes[shapeId], (uint)layer, (uint)mask, ownerId);

			int id = _nextStaticId++;
			_statics[id] = handle;
			return id;
		}

		[SupportedOSPlatform( "browser" )]
		[JSExport]
		public static void RemoveBody(int bodyId)
		{
			if (_bodies.Remove(bodyId, out BodyHandle handle))
				World.RemoveBody(handle);
		}

		[SupportedOSPlatform( "browser" )]
		[JSExport]
		public static void RemoveStatic(int staticId)
		{
			if (_statics.Remove(staticId, out StaticHandle handle))
				World.RemoveStatic(handle);
		}

		[SupportedOSPlatform( "browser" )]
		[JSExport]
		public static void SetBodyPose(
			int bodyId,
			double posX, double posY, double posZ,
			double quatX, double quatY, double quatZ, double quatW
		)
		{
			World.SetBodyPose(_bodies[bodyId], MakeTransform(posX, posY, posZ, quatX, quatY, quatZ, quatW));
		}

		[SupportedOSPlatform( "browser" )]
		[JSExport]
		public static void SetAwakeState(int bodyId, bool isAwake) =>
			World.SetAwakeState(_bodies[bodyId], isAwake);

		[SupportedOSPlatform( "browser" )]
		[JSExport]
		public static bool GetAwakeState(int bodyId) =>
			World.GetAwakeState(_bodies[bodyId]);

		[SupportedOSPlatform( "browser" )]
		[JSExport]
		public static void SetLinearVelocity(int bodyId, double x, double y, double z) =>
			World.SetLinearVelocity(_bodies[bodyId], new Vector3((float)x, (float)y, (float)z));

		[SupportedOSPlatform( "browser" )]
		[JSExport]
		public static void SetAngularVelocity(int bodyId, double x, double y, double z) =>
			World.SetAngularVelocity(_bodies[bodyId], new Vector3((float)x, (float)y, (float)z));

		[SupportedOSPlatform( "browser" )]
		[JSExport]
		public static void ApplyImpulse(
			int bodyId,
			double impulseX, double impulseY, double impulseZ,
			double offsetX, double offsetY, double offsetZ
		)
		{
			World.ApplyImpulse(
				_bodies[bodyId],
				new Vector3((float)impulseX, (float)impulseY, (float)impulseZ),
				new Vector3((float)offsetX, (float)offsetY, (float)offsetZ)
			);
		}

		#endregion

		#region Character movement

		// Returns [posX, posY, posZ, isOnFloor(0/1), floorNormalX, floorNormalY, floorNormalZ,
		// groundOwnerId, velX, velY, velZ] - one MoveCharacter result flattened to 11 doubles.
		[SupportedOSPlatform( "browser" )]
		[JSExport]
		[return: JSMarshalAs<JSType.Array<JSType.Number>>]
		public static double[] MoveCharacter(
			int selfBodyId,
			double posX, double posY, double posZ,
			double velX, double velY, double velZ,
			double dt,
			double radius, double cylinderLength,
			int layer, int mask
		)
		{
			CharacterMoveResult result = World.MoveCharacter(
				_bodies[selfBodyId],
				new Vector3((float)posX, (float)posY, (float)posZ),
				new Vector3((float)velX, (float)velY, (float)velZ),
				(float)dt,
				(float)radius, (float)cylinderLength,
				(uint)layer, (uint)mask,
				CharacterMoveOptions.Default
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

		#endregion

		#region Stepping

		/// <summary>
		/// Advances the simulation and returns every dynamic/kinematic body's fresh pose as a
		/// flat buffer: [bodyId, posX, posY, posZ, quatX, quatY, quatZ, quatW] repeated once per
		/// body currently registered, in unspecified order. Call GetLastOverlapEvents()
		/// immediately after to read this same step's Entered/Exited transitions.
		/// </summary>
		[SupportedOSPlatform( "browser" )]
		[JSExport]
		[return: JSMarshalAs<JSType.Array<JSType.Number>>]
		public static double[] Step(double dt)
		{
			_lastEvents = World.Step((float)dt);

			double[] transforms = new double[_bodies.Count * 8];
			int i = 0;
			foreach (KeyValuePair<int, BodyHandle> entry in _bodies)
			{
				if (!World.BodyExists(entry.Value))
					continue;

				PhysicsTransform pose = World.GetBodyPose(entry.Value);
				transforms[i++] = entry.Key;
				transforms[i++] = pose.Position.X;
				transforms[i++] = pose.Position.Y;
				transforms[i++] = pose.Position.Z;
				transforms[i++] = pose.Orientation.X;
				transforms[i++] = pose.Orientation.Y;
				transforms[i++] = pose.Orientation.Z;
				transforms[i++] = pose.Orientation.W;
			}

			// Bodies removed between the loop above running and now can't happen (single
			// threaded), but a body that stopped existing mid-loop would leave trailing zeros;
			// trim defensively so the JS side's `length / 8` body count is always exact.
			return i == transforms.Length ? transforms : transforms[..i];
		}

		/// <summary>Flat buffer from the most recent Step(): [ownerIdA, ownerIdB, entered(0/1)] per event.</summary>
		[SupportedOSPlatform( "browser" )]
		[JSExport]
		[return: JSMarshalAs<JSType.Array<JSType.Number>>]
		public static int[] GetLastOverlapEvents()
		{
			int[] events = new int[_lastEvents.Count * 3];
			int i = 0;
			foreach (OverlapEvent overlapEvent in _lastEvents)
			{
				events[i++] = overlapEvent.OwnerIdA;
				events[i++] = overlapEvent.OwnerIdB;
				events[i++] = overlapEvent.Entered ? 1 : 0;
			}
			return events;
		}

		#endregion

		#region Helpers

		private static PhysicsWorld World =>
			_world ?? throw new InvalidOperationException(
				"PhysicsBridge.CreateWorld must be called before any other PhysicsBridge method.");

		private static PhysicsTransform MakeTransform(
			double posX, double posY, double posZ,
			double quatX, double quatY, double quatZ, double quatW
		) => new PhysicsTransform(
			new Vector3((float)posX, (float)posY, (float)posZ),
			new Quaternion((float)quatX, (float)quatY, (float)quatZ, (float)quatW)
		);

		#endregion
	}
}
