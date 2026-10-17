// Created by Anton Piruev in 2026.
// Any direct commercial use of derivative work is strictly prohibited.

using System.Numerics;
using Xunit;

namespace Physics.Tests
{
	public class Smoke
	{
		[Fact]
		public void ABoxFallsOntoTheGround()
		{
			using PhysicsWorld world = new PhysicsWorld( PhysicsWorldSettings.Default );
			world.AddStatic( PhysicsTransform.FromPosition( new Vector3( 0, -1, 0 ) ), world.AddBoxShape( new Vector3( 100, 2, 100 ) ), uint.MaxValue, uint.MaxValue, 1 );
			BodyHandle box = world.AddDynamicBody( PhysicsTransform.FromPosition( new Vector3( 0, 3, 0 ) ), world.AddBoxShape( Vector3.One ), 1, uint.MaxValue, uint.MaxValue, 2 );
			for ( int i = 0; i < 120; i++ )
			{
				world.Step( 1 / 60f );
			}

			Assert.InRange( world.GetBodyPose( box ).Position.Y, 0.45f, 0.55f );
		}
	}
}