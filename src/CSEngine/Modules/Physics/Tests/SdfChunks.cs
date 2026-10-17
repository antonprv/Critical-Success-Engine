// Created by Anton Piruev in 2026.
// Any direct commercial use of derivative work is strictly prohibited.

using System;
using System.Numerics;
using Xunit;

namespace Physics.Tests
{
	/// <summary>
	/// What the SDF world needs of the physics: chunk meshes as they come from the mesher (indexed, 16-bit), swapped in
	/// place when an edit rebuilds a chunk, and their memory given back.
	/// </summary>
	public class SdfChunks
	{
		private const uint All = uint.MaxValue;

		/// <summary>A flat square of the given half size at height y, as two indexed triangles plus a sliver.</summary>
		private static (float[] Positions, ushort[] Indices) Floor( float y, float half = 20 )
		{
			float[] positions =
			{
				-half, y, -half,
				half, y, -half,
				half, y, half,
				-half, y, half,
			};
			// the last triangle has no area: left out
			ushort[] indices = { 0, 2, 1, 0, 3, 2, 0, 0, 1 };

			return (positions, indices);
		}

		private static float FallOnto( PhysicsWorld world, BodyHandle body, int steps = 180 )
		{
			for ( int i = 0; i < steps; i++ )
			{
				world.Step( 1 / 60f );
			}

			return world.GetBodyPose( body ).Position.Y;
		}

		[Fact]
		public void AnIndexedChunkIsSolid()
		{
			using PhysicsWorld world = new PhysicsWorld( PhysicsWorldSettings.Default );
			(float[] positions, ushort[] indices) = Floor( 0 );

			Assert.True( world.TryAddIndexedMeshShape( positions, indices, Vector3.One, out ShapeHandle shape ) );
			world.AddStatic( PhysicsTransform.FromPosition( Vector3.Zero ), shape, All, All, 1 );

			BodyHandle box = world.AddDynamicBody( PhysicsTransform.FromPosition( new Vector3( 0, 3, 0 ) ), world.AddBoxShape( Vector3.One ), 1, All, All, 2 );

			Assert.InRange( FallOnto( world, box ), 0.45f, 0.55f );
		}

		[Fact]
		public void ARebuiltChunkIsSwappedInPlaceAndWakesWhatRestsOnIt()
		{
			using PhysicsWorld world = new PhysicsWorld( PhysicsWorldSettings.Default );
			(float[] high, ushort[] indices) = Floor( 0 );
			(float[] low, _) = Floor( -2 );

			world.TryAddIndexedMeshShape( high, indices, Vector3.One, out ShapeHandle before );
			StaticHandle chunk = world.AddStatic( PhysicsTransform.FromPosition( Vector3.Zero ), before, All, All, 1 );
			BodyHandle box = world.AddDynamicBody( PhysicsTransform.FromPosition( new Vector3( 0, 1, 0 ) ), world.AddBoxShape( Vector3.One ), 1, All, All, 2 );

			// settles, then sleeps
			Assert.InRange( FallOnto( world, box, 600 ), 0.45f, 0.55f );
			Assert.False( world.GetAwakeState( box ) );

			// dug out from under it: the new mesh in, the old one's memory back
			world.TryAddIndexedMeshShape( low, indices, Vector3.One, out ShapeHandle after );
			world.SetStaticShape( chunk, after );
			world.RemoveShape( before );

			Assert.True( world.GetAwakeState( box ) );
			Assert.InRange( FallOnto( world, box ), -1.55f, -1.45f );
		}

		[Fact]
		public void AChunkWithoutAreaMakesNoShape()
		{
			using PhysicsWorld world = new PhysicsWorld( PhysicsWorldSettings.Default );
			float[] positions = { 0, 0, 0, 1, 0, 0, 2, 0, 0 };

			Assert.False( world.TryAddIndexedMeshShape( positions, new ushort[] { 0, 1, 2 }, Vector3.One, out _ ) );
			Assert.False( world.TryAddIndexedMeshShape( positions, Array.Empty<ushort>(), Vector3.One, out _ ) );
			Assert.Throws<ArgumentException>( () => world.TryAddIndexedMeshShape( new float[ 4 ], new ushort[ 3 ], Vector3.One, out _ ) );
			Assert.Throws<ArgumentException>( () => world.TryAddIndexedMeshShape( positions, new ushort[ 2 ], Vector3.One, out _ ) );
		}

		[Fact]
		public void RemovedShapesGiveTheirMemoryBack()
		{
			using PhysicsWorld world = new PhysicsWorld( PhysicsWorldSettings.Default );
			(float[] positions, ushort[] indices) = Floor( 0 );

			// thousands of rebuilds of one chunk: without RemoveShape the pool would keep growing
			world.TryAddIndexedMeshShape( positions, indices, Vector3.One, out ShapeHandle current );
			StaticHandle chunk = world.AddStatic( PhysicsTransform.FromPosition( Vector3.Zero ), current, All, All, 1 );
			long start = GC.GetTotalAllocatedBytes();

			for ( int i = 0; i < 5000; i++ )
			{
				world.TryAddIndexedMeshShape( positions, indices, Vector3.One, out ShapeHandle next );
				world.SetStaticShape( chunk, next );
				world.RemoveShape( current );
				current = next;
			}

			// the pool reuses its blocks; managed allocations stay small
			Assert.True( GC.GetTotalAllocatedBytes() - start < 4_000_000 );
		}
	}
}