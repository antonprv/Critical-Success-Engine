// A component written in C# that follows the TypeScript coins (Source/Scripts/CoinHunt.ts): each Coin publishes
// "Coin.Collected"; coins picked up within StreakSeconds of each other make a streak, announced with a toast and
// published as "Coin.Streak" for anyone who cares.
//
// It also talks with TypeScript through Source/Contracts/CoinHunt.contract: it is IStreaks for GameRules (which asks
// for the best streak), and it asks GameRules - the TypeScript component on the same entity - how many coins are left
// (IRound, through [FromTypeScript]). Its wording comes from the game's C# installer (StreakWording, [Inject]).

using CSEngine;
using CSEngine.Bridge;
using CSEngine.DI;

namespace TemplateProject;

/// <summary>What "Coin.Collected" carries (published by the TypeScript Coin).</summary>
public sealed record CoinCollected( string Coin );

/// <summary>What "Coin.Streak" carries.</summary>
public sealed record CoinStreak( int Count );

/// <summary>How a streak is announced: a C# service, bound by <see cref="CoinHuntInstaller"/>.</summary>
public interface IStreakWording
{
	string Announce( int streak, int coinsLeft );
}

public sealed class StreakWording : IStreakWording
{
	public string Announce( int streak, int coinsLeft ) =>
		coinsLeft > 0 ? $"Streak x{streak}! {coinsLeft} to go" : $"Streak x{streak}!";
}

/// <summary>The game's C# installer: the engine finds it in the game's assembly and installs it.</summary>
public sealed class CoinHuntInstaller : Installer
{
	public override void InstallBindings( ContainerBuilder builder ) => builder.Bind<IStreakWording>().To<StreakWording>().AsSingle();
}

public sealed class StreakTracker : Component, IStreaks
{
	public double StreakSeconds = 3;

	[Inject]
	private readonly IStreakWording _wording = null!;

	// GameRules, the TypeScript component on this entity
	[FromTypeScript]
	private readonly IRound _round = null!;

	private double _last = double.NegativeInfinity;
	private int _streak;
	private int _best;

	/// <summary>IStreaks, for TypeScript: the longest streak so far.</summary>
	public int Best() => _best;

	public override void Start() => Engine.Stream.Subscribe<CoinCollected>( "Coin.Collected", OnCoin );

	private void OnCoin( CoinCollected coin )
	{
		double now = Engine.Time.Elapsed;
		_streak = now - _last <= StreakSeconds ? _streak + 1 : 1;
		_last = now;
		_best = Math.Max( _best, _streak );
		if ( _streak >= 2 )
		{
			Engine.Ui.Toast( _wording.Announce( _streak, _round.CoinsLeft() ) );
			Engine.Stream.Publish( "Coin.Streak", new CoinStreak( _streak ) );
		}
	}
}