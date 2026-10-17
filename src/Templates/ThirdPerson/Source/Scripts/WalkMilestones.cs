// A component written in C#, on the player next to the TypeScript mover (Source/Scenes/ThirdPersonScene.ts): every
// MilestoneMeters walked (the HUD's DistanceHud shows the running total) it congratulates the player and publishes
// "Player.Milestone" for anyone who wants to react.

using CSEngine;
using System.Numerics;

namespace TemplateProject;

/// <summary>What "Player.Milestone" carries (TypeScript: { Meters }).</summary>
public sealed record Milestone( int Meters );

public sealed class WalkMilestones : Component
{
	public float MilestoneMeters = 25;

	private Vector3 _last;
	private float _walked;
	private int _milestones;

	public override void Start() => _last = Transform.Position;

	public override void OnPhysicsUpdate( float dt )
	{
		Vector3 position = Transform.Position;
		// along the ground only, as the HUD counts: a jump is not walking
		_walked += new Vector2( position.X - _last.X, position.Z - _last.Z ).Length();
		_last = position;
		if ( _walked < ( _milestones + 1 ) * MilestoneMeters )
		{
			return;
		}
		_milestones++;
		int meters = (int)( _milestones * MilestoneMeters );
		Engine.Ui.Toast( $"{meters} m walked!" );
		Engine.Stream.Publish( "Player.Milestone", new Milestone( meters ) );
	}
}