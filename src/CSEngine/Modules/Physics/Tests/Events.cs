// Created by Anton Piruev in 2026.
// Any direct commercial use of derivative work is strictly prohibited.

using System.Numerics;
using Xunit;

namespace Physics.Tests
{
	/// <summary>
	/// Overlap events: triggers (sensors, as in Box3D) and collisions. Both must always be right: no false exits when
	/// bodies fall asleep, an exit when a body goes away, nothing missed by a fast body.
	/// </summary>
	public class Events
	{
		private const float Dt = 1 / 60f;
		private const uint All = uint.MaxValue;
		private const int GroundId = 1;
		private const int TriggerId = 2;

		private static PhysicsWorld World()
		{
			PhysicsWorld world = new PhysicsWorld( PhysicsWorldSettings.Default );
			world.AddStatic( At( 0, -1, 0 ), world.AddBoxShape( new Vector3( 100, 2, 100 ) ), All, All, GroundId );
			return world;
		}

		private static PhysicsTransform At( float x, float y, float z ) => PhysicsTransform.FromPosition( new Vector3( x, y, z ) );

		/// <summary>Steps `count` times and returns every event seen, in order.</summary>
		private static List<OverlapEvent> Run( PhysicsWorld world, int count )
		{
			List<OverlapEvent> seen = new List<OverlapEvent>();
			for ( int i = 0; i < count; i++ )
			{
				seen.AddRange( world.Step( Dt ).ToArray() );
			}
			return seen;
		}

		/// <summary>A collision's two sides come in no particular order: the smaller owner id first.</summary>
		private static List<(int A, int B, bool Entered)> Collisions( List<OverlapEvent> events, int ownerId ) =>
			Of( events, ownerId ).Select( e => (Math.Min( e.A, e.B ), Math.Max( e.A, e.B ), e.Entered) ).ToList();

		/// <summary>The events about one owner (a trigger's have the trigger first).</summary>
		private static List<(int A, int B, bool Entered)> Of( List<OverlapEvent> events, int ownerId ) =>
			events
				.Where( e => e.OwnerIdA == ownerId || e.OwnerIdB == ownerId )
				.Select( e => (e.OwnerIdA, e.OwnerIdB, e.Entered) )
				.ToList();

		[Fact]
		public void ABodyFallsThroughATriggerAndRestsInsideItWithoutAFalseExitWhenItSleeps()
		{
			using PhysicsWorld world = World();
			world.AddStatic( At( 0, 2, 0 ), world.AddBoxShape( new Vector3( 4, 4, 4 ) ), All, All, TriggerId, PhysicsObjectKind.Trigger );
			BodyHandle ball = world.AddDynamicBody( At( 0, 8, 0 ), world.AddSphereShape( 0.5f ), 1, All, All, 10 );

			List<OverlapEvent> events = Run( world, 600 );

			Assert.False( world.GetAwakeState( ball ) );
			Assert.InRange( world.GetBodyPose( ball ).Position.Y, 0.45f, 0.55f );
			Assert.Equal( [ (TriggerId, 10, true) ], Of( events, TriggerId ) );

			world.RemoveBody( ball );
			Assert.Equal( [ (TriggerId, 10, false) ], Of( Run( world, 1 ), TriggerId ) );
		}

		[Fact]
		public void LeavingATriggerExitsIt()
		{
			using PhysicsWorld world = World();
			world.AddStatic( At( 0, 5, 0 ), world.AddBoxShape( new Vector3( 4, 2, 4 ) ), All, All, TriggerId, PhysicsObjectKind.Trigger );
			world.AddDynamicBody( At( 0, 9, 0 ), world.AddSphereShape( 0.5f ), 1, All, All, 10 );

			Assert.Equal( [ (TriggerId, 10, true), (TriggerId, 10, false) ], Of( Run( world, 120 ), TriggerId ) );
		}

		[Fact]
		public void AMovingTriggerFindsASleepingBody()
		{
			using PhysicsWorld world = World();
			BodyHandle box = world.AddDynamicBody( At( 5, 0.5f, 0 ), world.AddBoxShape( Vector3.One ), 1, All, All, 10 );
			BodyHandle zone = world.AddKinematicBody( At( -5, 1, 0 ), world.AddBoxShape( new Vector3( 2, 2, 2 ) ), All, All, TriggerId, PhysicsObjectKind.Trigger );
			Run( world, 300 );
			Assert.False( world.GetAwakeState( box ) );

			world.SetBodyPose( zone, At( 5, 1, 0 ) );
			Assert.Equal( [ (TriggerId, 10, true) ], Of( Run( world, 1 ), TriggerId ) );
			Assert.False( world.GetAwakeState( box ) );
		}

		[Fact]
		public void AFastBodyThatCrossesAThinTriggerInOneStepEntersAndExitsIt()
		{
			using PhysicsWorld world = World();
			world.AddStatic( At( 0, 5, -30 ), world.AddBoxShape( new Vector3( 10, 10, 0.1f ) ), All, All, TriggerId, PhysicsObjectKind.Trigger );
			BodyHandle bullet = world.AddDynamicBody( At( 0, 5, -20 ), world.AddSphereShape( 0.1f ), 0.1f, All, All, 10, PhysicsObjectKind.Projectile, continuousDetection: true );
			world.SetLinearVelocity( bullet, new Vector3( 0, 0, -600 ) );

			Assert.Equal( [ (TriggerId, 10, true), (TriggerId, 10, false) ], Of( Run( world, 3 ), TriggerId ) );
		}

		[Fact]
		public void RemovingATriggerExitsEverythingInIt()
		{
			using PhysicsWorld world = World();
			StaticHandle zone = world.AddStatic( At( 0, 2, 0 ), world.AddBoxShape( new Vector3( 4, 4, 4 ) ), All, All, TriggerId, PhysicsObjectKind.Trigger );
			world.AddDynamicBody( At( 0, 0.5f, 0 ), world.AddBoxShape( Vector3.One ), 1, All, All, 10 );
			Run( world, 5 );

			world.RemoveStatic( zone );
			Assert.Equal( [ (TriggerId, 10, false) ], Of( Run( world, 1 ), TriggerId ) );
		}

		[Fact]
		public void TriggersRespectLayersAndSeeNeitherStaticsNorOtherTriggers()
		{
			using PhysicsWorld world = World();
			world.AddStatic( At( 0, 2, 0 ), world.AddBoxShape( new Vector3( 6, 4, 6 ) ), 1, 2, TriggerId, PhysicsObjectKind.Trigger );
			world.AddDynamicBody( At( -1, 0.5f, 0 ), world.AddBoxShape( Vector3.One ), 1, 2, All, 10 );
			world.AddDynamicBody( At( 1, 0.5f, 0 ), world.AddBoxShape( Vector3.One ), 1, 4, All, 11 );
			world.AddStatic( At( 0, 1, 2 ), world.AddBoxShape( Vector3.One ), All, All, 12 );
			world.AddStatic( At( 0, 1, -2 ), world.AddBoxShape( Vector3.One ), All, All, 13, PhysicsObjectKind.Trigger );

			Assert.Equal( [ (TriggerId, 10, true) ], Of( Run( world, 5 ), TriggerId ) );
		}

		[Fact]
		public void ATriggerNeverPushesAnything()
		{
			using PhysicsWorld world = World();
			world.AddStatic( At( 0, 2, 0 ), world.AddBoxShape( new Vector3( 4, 4, 4 ) ), All, All, TriggerId, PhysicsObjectKind.Trigger );
			BodyHandle box = world.AddDynamicBody( At( 0, 2, 0 ), world.AddBoxShape( Vector3.One ), 1, All, All, 10 );
			Run( world, 120 );
			Assert.InRange( world.GetBodyPose( box ).Position.Y, 0.45f, 0.55f );
			Assert.InRange( world.GetBodyPose( box ).Position.X, -0.01f, 0.01f );
		}

		[Fact]
		public void ACollisionEntersOnceAndDoesNotExitWhenTheBodiesFallAsleep()
		{
			using PhysicsWorld world = World();
			BodyHandle box = world.AddDynamicBody( At( 0, 1, 0 ), world.AddBoxShape( Vector3.One ), 1, All, All, 10 );

			List<OverlapEvent> events = Run( world, 600 );

			Assert.False( world.GetAwakeState( box ) );
			Assert.Equal( [ (GroundId, 10, true) ], Collisions( events, 10 ) );

			world.RemoveBody( box );
			Assert.Equal( [ (GroundId, 10, false) ], Collisions( Run( world, 1 ), 10 ) );
		}

		[Fact]
		public void AHandleReusedForANewBodyEndsTheOldBodysOverlapsAndStartsItsOwn()
		{
			using PhysicsWorld world = World();
			world.AddStatic( At( 0, 2, 0 ), world.AddBoxShape( new Vector3( 4, 4, 4 ) ), All, All, TriggerId, PhysicsObjectKind.Trigger );
			ShapeHandle cube = world.AddBoxShape( Vector3.One );
			BodyHandle first = world.AddDynamicBody( At( 0, 0.5f, 0 ), cube, 1, All, All, 10 );
			Run( world, 2 );

			world.RemoveBody( first );
			BodyHandle second = world.AddDynamicBody( At( 0, 0.5f, 0 ), cube, 1, All, All, 11 );
			Assert.Equal( first.Value, second.Value );
			List<(int A, int B, bool Entered)> events = Of( Run( world, 1 ), TriggerId );
			Assert.Contains( (TriggerId, 10, false), events );
			Assert.Contains( (TriggerId, 11, true), events );
		}

		[Fact]
		public void ATriggerIsItsShapeNotItsBoundingBox()
		{
			using PhysicsWorld world = World();
			// A thin slab turned 45 degrees: its bounding box covers the corner where the box rests, the slab doesn't.
			Quaternion turn = Quaternion.CreateFromAxisAngle( Vector3.UnitY, MathF.PI / 4 );
			world.AddStatic( new PhysicsTransform( new Vector3( 0, 2, 0 ), turn ), world.AddBoxShape( new Vector3( 10, 4, 0.5f ) ), All, All, TriggerId, PhysicsObjectKind.Trigger );
			world.AddDynamicBody( At( 3, 0.5f, 3 ), world.AddBoxShape( Vector3.One ), 1, All, All, 10 );
			world.AddDynamicBody( At( 2, 0.5f, -2 ), world.AddBoxShape( Vector3.One ), 1, All, All, 11 );

			Assert.Equal( [ (TriggerId, 11, true) ], Of( Run( world, 5 ), TriggerId ) );
		}

		[Fact]
		public void EveryShapeVisitsAndAMeshCanBeATrigger()
		{
			using PhysicsWorld world = World();
			Vector3[] quad =
			[
				new Vector3( -5, 0.2f, -5 ), new Vector3( 5, 0.2f, -5 ), new Vector3( 5, 0.2f, 5 ),
				new Vector3( -5, 0.2f, -5 ), new Vector3( 5, 0.2f, 5 ), new Vector3( -5, 0.2f, 5 ),
			];
			world.AddStatic( At( 0, 0, 0 ), world.AddTriangleMeshShape( quad, Vector3.One ), All, All, TriggerId, PhysicsObjectKind.Trigger );
			world.AddDynamicBody( At( -4, 0.5f, 0 ), world.AddSphereShape( 0.5f ), 1, All, All, 10 );
			world.AddDynamicBody( At( -2, 1f, 0 ), world.AddCapsuleShape( 0.5f, 1 ), 1, All, All, 11 );
			world.AddDynamicBody( At( 0, 0.5f, 0 ), world.AddCylinderShape( 0.5f, 1 ), 1, All, All, 12 );
			Vector3[] cube = [new( -0.5f, -0.5f, -0.5f ), new( 0.5f, -0.5f, -0.5f ), new( -0.5f, 0.5f, -0.5f ), new( 0.5f, 0.5f, -0.5f ),
				new( -0.5f, -0.5f, 0.5f ), new( 0.5f, -0.5f, 0.5f ), new( -0.5f, 0.5f, 0.5f ), new( 0.5f, 0.5f, 0.5f )];
			world.AddDynamicBody( At( 2, 0.5f, 0 ), world.AddConvexHullShape( cube, 1, out _ ), 1, All, All, 13 );
			// Too high to touch the mesh.
			world.AddDynamicBody( At( 4, 3, 0 ), world.AddBoxShape( Vector3.One ), 1, All, All, 14 );

			List<(int A, int B, bool Entered)> events = Of( Run( world, 2 ), TriggerId );
			Assert.Equal( [ 10, 11, 12, 13 ], events.Where( e => e.Entered ).Select( e => e.B ).Order().ToList() );
		}

		[Fact]
		public void AKinematicBodyMovedIntoATriggerEntersIt()
		{
			using PhysicsWorld world = World();
			world.AddStatic( At( 0, 1, 0 ), world.AddBoxShape( new Vector3( 2, 2, 2 ) ), All, All, TriggerId, PhysicsObjectKind.Trigger );
			BodyHandle character = world.AddKinematicBody( At( 10, 1, 0 ), world.AddCapsuleShape( 0.4f, 1 ), All, All, 10, PhysicsObjectKind.Character );
			Assert.Empty( Of( Run( world, 2 ), TriggerId ) );

			world.SetBodyPose( character, At( 0, 1, 0 ) );
			Assert.Equal( [ (TriggerId, 10, true) ], Of( Run( world, 1 ), TriggerId ) );
		}

		[Fact]
		public void SteppingASettledWorldAllocatesNothing()
		{
			using PhysicsWorld world = World();
			world.AddStatic( At( 0, 2, 0 ), world.AddBoxShape( new Vector3( 4, 4, 4 ) ), All, All, TriggerId, PhysicsObjectKind.Trigger );
			ShapeHandle cube = world.AddBoxShape( Vector3.One );
			for ( int i = 0; i < 20; i++ )
			{
				world.AddDynamicBody( At( ( i % 5 ) * 1.5f - 3, 0.5f + ( i / 5 ) * 1.1f, 0 ), cube, 1, All, All, 100 + i );
			}
			world.Step( Dt );
			Run( world, 120 );

			long before = GC.GetAllocatedBytesForCurrentThread();
			for ( int i = 0; i < 60; i++ )
			{
				world.Step( Dt );
			}
			Assert.Equal( 0, GC.GetAllocatedBytesForCurrentThread() - before );
		}
	}
}