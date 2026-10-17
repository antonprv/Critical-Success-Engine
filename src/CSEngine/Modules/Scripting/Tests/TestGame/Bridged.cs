// Created by Anton Piruev in 2026.
// Any direct commercial use of derivative work is strictly prohibited.

// C# and TypeScript calling each other through the contracts of Contracts/Game.contract (../Integration.test.ts).

using CSEngine;
using CSEngine.Bridge;
using CSEngine.DI;

namespace TestGame;

/// <summary>The game's C# installer: found in its assembly and installed by the engine.</summary>
public sealed class GameInstaller : Installer
{
	public override void InstallBindings( ContainerBuilder builder ) => builder.Bind<IClock>().To<Clock>().AsSingle();
}

public sealed class Clock : IClock
{
	private int _ticks;

	public int Ticks() => ++_ticks;
}

/// <summary>Implements ICounter for TypeScript; greets through TypeScript's IGreeter every frame.</summary>
public sealed class Counter : Component, ICounter
{
	[Inject]
	private readonly IClock _clock = null!;

	[FromTypeScript]
	private readonly IGreeter _greeter = null!;

	private int _count;

	public int Add( int amount ) => _count += amount;

	public string Label() => $"{Entity.Name}: {_count} at tick {_clock.Ticks()}";

	public override void Update( float dt ) => Engine.Ui.Toast( _greeter.Greet( Entity.Name, Transform.Position ) );
}