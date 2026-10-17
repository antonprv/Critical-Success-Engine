// Created by Anton Piruev in 2026.
// Any direct commercial use of derivative work is strictly prohibited.

using Xunit;

namespace CSEngine.DI.Tests
{
	public interface IScore
	{
		int Points { get; }

		void Add( int points );
	}

	public interface ILog
	{
		List<string> Lines { get; }
	}

	public sealed class Score : IScore, IDisposable
	{
		public int Points { get; private set; }

		public bool Disposed { get; private set; }

		public void Add( int points ) => Points += points;

		public void Dispose() => Disposed = true;
	}

	public sealed class Log : ILog, IInitializable
	{
		public List<string> Lines { get; } = new();

		public void Initialize() => Lines.Add( "initialized" );
	}

	/// <summary>A service with injected fields of its own.</summary>
	public sealed class Referee
	{
		[Inject]
		private readonly IScore _score = null!;

		[Inject]
		public ILog Log { get; private set; } = null!;

		public IScore Score => _score;
	}

	public class BaseComponent
	{
		[Inject]
		protected IScore Score = null!;

		public IScore BaseScore => Score;
	}

	public sealed class Coin : BaseComponent
	{
		[Inject]
		private ILog _log = null!;

		public string? NotInjected;

		public ILog TheLog => _log;
	}

	public sealed class Needy
	{
		[Inject]
		private IScore _score = null!;

		public IScore TheScore => _score;
	}

	/// <summary>An attribute that resolves its own way (as [FromTypeScript] does).</summary>
	public sealed class FromNameAttribute : InjectAttribute
	{
		public override object? Resolve( Container container, Type type, object target ) => $"{type.Name} for {target.GetType().Name}";
	}

	public sealed class Named
	{
		[FromName]
		public string Text = "";
	}

	public sealed class ScoreInstaller : Installer
	{
		public static int Runs;

		public override void InstallBindings( ContainerBuilder builder )
		{
			Runs++;
			builder.Bind<IScore>().To<Score>().AsSingle();
		}
	}

	public sealed class GameInstaller : Installer
	{
		public override void InstallBindings( ContainerBuilder builder )
		{
			builder.Install( new ScoreInstaller() );
			builder.Install( new ScoreInstaller() ); // once per class: composing installers is safe
			builder.Bind<ILog>().To<Log>();
		}
	}

	public sealed class ContainerTests
	{
		[Fact]
		public void BindingsMakeSingletonsTransientsInstancesAndFactories()
		{
			Log given = new();
			ContainerBuilder builder = new();
			builder.Bind<IScore>().To<Score>().AsSingle();
			builder.BindInstance<ILog>( given );
			builder.Bind<Referee>().FromFactory( container => container.Inject( new Referee() ) ).AsTransient();
			Container container = builder.Build();

			Assert.Same( container.Resolve<IScore>(), container.Resolve<IScore>() );
			Assert.Same( given, container.Resolve<ILog>() );
			Referee first = container.Resolve<Referee>();
			Assert.NotSame( first, container.Resolve<Referee>() );
			Assert.Same( container.Resolve<IScore>(), first.Score );
			Assert.Same( given, first.Log );
			Assert.True( container.Has<IScore>() );
			Assert.False( container.Has<Coin>() );
			Assert.Null( container.TryResolve<Coin>() );
			Assert.Same( given, container.TryResolve<ILog>() );
			Assert.Same( given, container.Resolve( typeof( ILog ) ) );
		}

		[Fact]
		public void InjectFillsFieldsAndPropertiesOfTheClassAndItsBases()
		{
			ContainerBuilder builder = new();
			builder.Bind<IScore>().To<Score>();
			builder.Bind<ILog>().To<Log>();
			Container container = builder.Build();
			Coin coin = container.Inject( new Coin() );
			Assert.Same( container.Resolve<IScore>(), coin.BaseScore );
			Assert.Same( container.Resolve<ILog>(), coin.TheLog );
			Assert.Null( coin.NotInjected );
			Assert.Equal( "String for Named", container.Inject( new Named() ).Text );
		}

		[Fact]
		public void AFieldNothingIsBoundToIsAnError()
		{
			Container container = new ContainerBuilder().Build();
			InvalidOperationException error = Assert.Throws<InvalidOperationException>( () => container.Inject( new Needy() ) );
			Assert.Equal( "Needy._score needs IScore, and nothing is bound to it", error.Message );
			Assert.Equal( "Nothing is bound to IScore", Assert.Throws<InvalidOperationException>( () => container.Resolve<IScore>() ).Message );
		}

		[Fact]
		public void InstallersComposeOncePerClass()
		{
			ScoreInstaller.Runs = 0;
			Container container = new ContainerBuilder().Install( new GameInstaller() ).Build();
			Assert.Equal( 1, ScoreInstaller.Runs );
			Assert.IsType<Score>( container.Resolve<IScore>() );
			Assert.IsType<Log>( container.Resolve<ILog>() );
		}

		[Fact]
		public void BindingTwiceOrToNothingIsAnError()
		{
			ContainerBuilder twice = new();
			twice.Bind<IScore>().To<Score>();
			Assert.Equal( "IScore is bound twice", Assert.Throws<InvalidOperationException>( () => twice.Bind<IScore>() ).Message );
			ContainerBuilder empty = new();
			empty.Bind<IScore>();
			Assert.Equal( "IScore is bound to nothing (To, FromInstance or FromFactory)", Assert.Throws<InvalidOperationException>( () => empty.Build() ).Message );
		}

		[Fact]
		public void NonLazyIsMadeAtBuildAndInitialized()
		{
			ContainerBuilder builder = new();
			builder.Bind<ILog>().To<Log>().NonLazy();
			Container container = builder.Build();
			Assert.Equal( new[] { "initialized" }, container.Resolve<ILog>().Lines );
		}

		[Fact]
		public void ChildrenFallBackToTheirParentAndDisposeWhatTheyMade()
		{
			Score given = new();
			ContainerBuilder builder = new();
			builder.Bind<IScore>().To<Score>();
			Container root = builder.Build();
			Container child = root.CreateChild( scene => scene.Bind<ILog>().To<Log>() );
			Assert.Same( root.Resolve<IScore>(), child.Resolve<IScore>() );
			Assert.False( root.Has<ILog>() );
			Container other = root.CreateChild( scene => scene.BindInstance<IScore>( given ) );
			Assert.Same( given, other.Resolve<IScore>() );

			Score made = (Score)root.Resolve<IScore>();
			other.Dispose();
			Assert.False( given.Disposed ); // given from outside: not the container's to dispose
			root.Dispose();
			root.Dispose();
			Assert.True( made.Disposed );
			Assert.Equal( "The container of IScore is disposed", Assert.Throws<InvalidOperationException>( () => root.Resolve<IScore>() ).Message );
		}
	}
}