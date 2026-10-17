// Created by Anton Piruev in 2026.
// Any direct commercial use of derivative work is strictly prohibited.

using System.Numerics;
using Xunit;

namespace Physics.Tests
{
	/// <summary>A kinematic body driven the way the engine drives it: a velocity and a pose each step.</summary>
	public class Kinematics
	{
		private const uint All = uint.MaxValue;
		private const float Dt = 1 / 60f;

		private static PhysicsWorld World( out BodyHandle ball )
		{
			PhysicsWorld world = new PhysicsWorld( PhysicsWorldSettings.Default );
			world.AddStatic( PhysicsTransform.FromPosition( new Vector3( 0, -1, 0 ) ), world.AddBoxShape( new Vector3( 100, 2, 100 ) ), All, All, 1 );
			ball = world.AddDynamicBody( PhysicsTransform.FromPosition( new Vector3( 0, 0.3f, 0 ) ), world.AddSphereShape( 0.3f ), 1, All, All, 2 );
			return world;
		}

		private static void Drive( PhysicsWorld world, BodyHandle paddle, float fromX, float speed, int steps )
		{
			for ( int i = 0; i < steps; i++ )
			{
				world.SetLinearVelocity( paddle, new Vector3( speed, 0, 0 ) );
				world.SetBodyPose( paddle, PhysicsTransform.FromPosition( new Vector3( fromX + speed * Dt * ( i + 1 ), 0.75f, 0 ) ) );
				world.Step( Dt );
			}
		}

		[Fact]
		public void AMovingKinematicBodyPushesABodyThatFellAsleep()
		{
			using PhysicsWorld world = World( out BodyHandle ball );
			BodyHandle paddle = world.AddKinematicBody( PhysicsTransform.FromPosition( new Vector3( -3, 0.75f, 0 ) ), world.AddBoxShape( new Vector3( 1, 1.5f, 4 ) ), All, All, 3 );
			Drive( world, paddle, -3, 0, 300 ); // standing still: everything falls asleep
			Assert.False( world.GetAwakeState( ball ) );

			Drive( world, paddle, -3, 4, 90 ); // 6 m to the right, through the ball
			Assert.True( world.GetBodyPose( ball ).Position.X > 1, $"the ball stayed at {world.GetBodyPose( ball ).Position}" );
		}

		[Fact]
		public void AKinematicBodyToldTheSamePoseEveryStepStillFallsAsleep()
		{
			using PhysicsWorld world = World( out BodyHandle _ );
			BodyHandle platform = world.AddKinematicBody( PhysicsTransform.FromPosition( new Vector3( -3, 0.75f, 0 ) ), world.AddBoxShape( Vector3.One ), All, All, 3 );
			Drive( world, platform, -3, 0, 300 );
			Assert.False( world.GetAwakeState( platform ) );
		}

		[Fact]
		public void AVelocityWakesASleepingBodyAndAZeroOneDoesNot()
		{
			using PhysicsWorld world = World( out BodyHandle ball );
			for ( int i = 0; i < 300; i++ )
			{
				world.Step( Dt );
			}
			world.SetLinearVelocity( ball, Vector3.Zero );
			world.SetAngularVelocity( ball, Vector3.Zero );
			Assert.False( world.GetAwakeState( ball ) );
			world.SetAngularVelocity( ball, Vector3.UnitY );
			Assert.True( world.GetAwakeState( ball ) );
			for ( int i = 0; i < 300; i++ )
			{
				world.Step( Dt );
			}
			world.SetLinearVelocity( ball, Vector3.UnitX );
			Assert.True( world.GetAwakeState( ball ) );
		}
	}
}