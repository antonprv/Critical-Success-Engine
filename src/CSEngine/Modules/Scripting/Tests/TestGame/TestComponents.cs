// Created by Anton Piruev in 2026.
// Any direct commercial use of derivative work is strictly prohibited.

// C# components the TypeScript integration test (../Integration.test.ts) runs through the real .NET runtime.

using CSEngine;
using System.Numerics;

namespace TestGame;

public sealed record Ping( int N );

public sealed record Pong( int N, string From );

/// <summary>Moves along X; reports what it touches.</summary>
public sealed class Mover : Component
{
	public float Speed = 1;
	public string Greeting = "";

	public override void Awake() => Engine.Log.Info( $"{Greeting} from {Entity.Name} at {Transform.Position.X}" );

	public override void Update( float dt ) => Transform.Position += new Vector3( Speed * dt, 0, 0 );

	public override void OnInputUpdate( Input input, float dt )
	{
		if ( input.ActionJustPressed( "Jump" ) )
		{
			Transform.Rotation = Quaternion.CreateFromAxisAngle( Vector3.UnitY, input.ActionValue( "Turn" ) );
		}
	}

	public override void OnTriggerEnter( Entity other ) => Engine.Ui.Toast( $"{Entity.Name} entered {other.Name}" );

	public override void OnUIUpdate( float dt ) => Engine.Ui.SetHud( "x", $"{Transform.Position.X:0.00}" );
}

/// <summary>Answers "Ping" with "Pong" (TypeScript publishes one, C# the other).</summary>
public sealed class Echo : Component
{
	public override void Start() => Engine.Stream.Subscribe<Ping>( "Ping", ping => Engine.Stream.Publish( "Pong", new Pong( ping.N + 1, Entity.Name ) ) );
}

public sealed class Faulty : Component
{
	public override void OnPhysicsUpdate( float dt ) => throw new InvalidOperationException( "broken on purpose" );
}

/// <summary>Destroys its entity when it hits something.</summary>
public sealed class Fragile : Component
{
	public override void OnCollisionEnter( Entity other ) => Entity.Destroy();

	public override void OnDestroy() => Engine.Log.Warning( $"{Entity.Name} broke" );
}