// Created by Anton Piruev in 2026.
// Any direct commercial use of derivative work is strictly prohibited.

using System.Numerics;
using Xunit;

namespace Physics.Tests
{
	/// <summary>The bodies that moved this step: what the bridge sends to the game, instead of every body.</summary>
	public class ActiveBodies
	{
		private const uint All = uint.MaxValue;

		[Fact]
		public void OnlyAwakeBodiesAreListedWithTheirPosesAndVelocities()
		{
			using PhysicsWorld world = new PhysicsWorld( PhysicsWorldSettings.Default );
			world.AddStatic( PhysicsTransform.FromPosition( new Vector3( 0, -1, 0 ) ), world.AddBoxShape( new Vector3( 100, 2, 100 ) ), All, All, 1 );
			BodyHandle resting = world.AddDynamicBody( PhysicsTransform.FromPosition( new Vector3( 0, 0.5f, 0 ) ), world.AddBoxShape( Vector3.One ), 1, All, All, 2 );
			BodyHandle falling = world.AddDynamicBody( PhysicsTransform.FromPosition( new Vector3( 5, 50, 0 ) ), world.AddSphereShape( 0.5f ), 1, All, All, 3 );
			for ( int i = 0; i < 120; i++ )
			{
				world.Step( 1 / 60f );
			}

			List<ActiveBody> listed = [];
			foreach ( ActiveBody body in world.ActiveBodies )
			{
				listed.Add( body );
			}
			Assert.False( world.GetAwakeState( resting ) );
			ActiveBody only = Assert.Single( listed );
			Assert.Equal( falling, only.Handle );
			Assert.Equal( world.GetBodyPose( falling ).Position, only.Pose.Position );
			Assert.Equal( world.GetLinearVelocity( falling ), only.LinearVelocity );
			Assert.True( only.LinearVelocity.Y < 0 );
		}

		[Fact]
		public void EnumeratingAllocatesNothing()
		{
			using PhysicsWorld world = new PhysicsWorld( PhysicsWorldSettings.Default );
			world.AddDynamicBody( PhysicsTransform.FromPosition( Vector3.Zero ), world.AddSphereShape( 1 ), 1, All, All, 1 );
			world.Step( 1 / 60f );
			int Count()
			{
				int count = 0;
				foreach ( ActiveBody _ in world.ActiveBodies )
				{
					count++;
				}
				return count;
			}
			// The first pass compiles the enumerator; the steady state is what counts.
			Count();
			long before = GC.GetAllocatedBytesForCurrentThread();
			int listed = Count();
			long allocated = GC.GetAllocatedBytesForCurrentThread() - before;
			Assert.Equal( 1, listed );
			Assert.Equal( 0, allocated );
		}


		[Fact]
		public void TheBridgesSnapshotWritesTheAwakeBodiesWithTheirIdsAndSkipsUnknownOnes()
		{
			using PhysicsWorld world = new PhysicsWorld( PhysicsWorldSettings.Default );
			BodyHandle known = world.AddDynamicBody( PhysicsTransform.FromPosition( new Vector3( 1, 2, 3 ) ), world.AddSphereShape( 1 ), 1, All, All, 1 );
			world.AddDynamicBody( PhysicsTransform.FromPosition( new Vector3( 9, 9, 9 ) ), world.AddSphereShape( 1 ), 1, All, All, 2 );
			world.Step( 1 / 60f );

			int[] ids = new int[ known.Value + 1 ];
			ids[ known.Value ] = 42;
			double[] snapshot = new double[ 28 ];
			int written = world.WriteActiveBodies( snapshot, ids );

			Assert.Equal( 14, written );
			ActiveBody expected = world.ActiveBodies.GetEnumerator() is var e && e.MoveNext() ? e.Current : default;
			Assert.Equal( 42, snapshot[ 0 ] );
			Assert.Equal( (double)world.GetBodyPose( known ).Position.Y, snapshot[ 2 ] );
			Assert.Equal( 1.0, snapshot[ 7 ] );
			Assert.Equal( (double)world.GetLinearVelocity( known ).Y, snapshot[ 9 ] );
			Assert.Equal( known, expected.Handle );
		}
	}
}