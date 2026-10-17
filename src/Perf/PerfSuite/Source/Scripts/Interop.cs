// The C# half of the interop load (Source/Scripts/Interop.ts): TypeScript calls it CallsPerFrame times a frame, and
// it calls TypeScript's IClock as many times back.

using CSEngine;
using CSEngine.Bridge;

namespace PerfSuite;

public sealed class InteropTarget : Component, ICounter
{
	public int CallsPerFrame = 500;

	// InteropLoad, the TypeScript component on this entity
	[FromTypeScript]
	private readonly IClock _clock = null!;

	private int _total;
	private double _sum;

	public int Add( int amount ) => _total += amount;

	public Probe Echo( Probe probe ) => probe;

	public override void Update( float dt )
	{
		for ( int i = 0; i < CallsPerFrame; i++ )
		{
			_sum += _clock.Now();
		}
	}
}