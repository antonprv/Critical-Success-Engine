// A component written in C#: it sits on the ball next to the TypeScript ones (Source/Scenes/BouncingBallScene.ts puts
// it there with CSharp( "BallWatcher" )). It shows the ball's height on the HUD and tells everyone when the ball
// lands, on the DataStream tag "Ball.Landed" - Source/Scripts/LandingToast.ts, a TypeScript component, shows it.

using CSEngine;

using FastMath;

namespace TemplateProject;

/// <summary>What "Ball.Landed" carries: TypeScript sees it as { Count, Height }.</summary>
public sealed record Landing( int Count, float Height );

public sealed class BallWatcher : Component
{
	/// <summary>Set from the scene (CSharp( "BallWatcher", { HudKey: ... } )).</summary>
	public string HudKey = "ball.height";

	private int _landings;
	private float _highest;

	public override void OnUIUpdate( float dt )
	{
		float height = Transform.Position.Y;
		_highest = FMath.Max( _highest, height );
		Engine.Ui.SetHud( HudKey, $"Ball height: {height:0.0} m" );
	}

	public override void OnCollisionEnter( Entity other )
	{
		if ( other.Name != "Ground" )
		{
			return;
		}
		_landings++;
		Engine.Stream.Publish( "Ball.Landed", new Landing( _landings, _highest ) );
		_highest = 0;
	}
}