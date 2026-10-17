// A component written in C# that follows the TypeScript pads (Source/Scripts/Pads.ts): every VisitPad publishes
// "Pad.Visited" when the player first steps on it; this times the tour from the first pad to the last.

using CSEngine;

namespace TemplateProject;

/// <summary>What "Pad.Visited" carries (published by the TypeScript VisitPad).</summary>
public sealed record PadVisit( string Pad, int Visited, int Total );

public sealed class VisitTimer : Component
{
	private double _start = -1;

	public override void Start() => Engine.Stream.Subscribe<PadVisit>( "Pad.Visited", OnVisit );

	private void OnVisit( PadVisit visit )
	{
		if ( _start < 0 )
		{
			_start = Engine.Time.Elapsed;
		}
		if ( visit.Visited == visit.Total )
		{
			Engine.Ui.Toast( $"All {visit.Total} pads in {Engine.Time.Elapsed - _start:0.0} s" );
		}
	}
}