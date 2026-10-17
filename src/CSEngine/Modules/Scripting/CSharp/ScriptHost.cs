// Created by Anton Piruev in 2026.
// Any direct commercial use of derivative work is strictly prohibited.

using CSEngine.Bridge;
using CSEngine.DI;
using CSEngine.Messaging;
using System;
using System.Collections.Generic;
using System.Diagnostics.CodeAnalysis;
using System.Numerics;

namespace CSEngine
{
	/// <summary>
	/// Runs a game's C# components for the TypeScript runtime: <see cref="Run"/> takes one phase's commands (see
	/// Protocol.cs) and returns what came of them. Nothing here knows about the browser; Browser/ScriptExports.cs hands
	/// it to JavaScript, the tests call it directly.
	/// </summary>
	public sealed class ScriptHost
	{
		// Component ids in creation order: hooks run in this order (the manifest's).
		private readonly List<int> _order = new();
		private readonly Dictionary<int, Component> _components = new();
		private readonly MessagePackWriter _writer = new();
		private Action<byte[]>? _fromTypeScript;
		private Container? _container;

		public ScriptHost()
		{
			Engine = new ScriptEngine();
			Engine.Stream.Connect( new DelegateLink( Engine.Results.StreamBatches.Add, receive => _fromTypeScript = receive ) );
			Bridge.Resolver = Resolve;
		}

		public ScriptEngine Engine { get; }

		public ScriptRegistry Registry { get; } = new();

		/// <summary>Calls between C# and TypeScript through contracts (.contract files).</summary>
		public ScriptBridge Bridge { get; } = new();

		/// <summary>
		/// The game's C# container, made on first use: the engine (ScriptEngine, its World, Ui, Log, Time, Input, Stream,
		/// and the Bridge), then the game's installers. C# components get their [Inject] fields from it before Awake.
		/// </summary>
		public Container Container => _container ??= BuildContainer();

		/// <summary>Runs a call from TypeScript (a contract's method; see Bridge/Contracts.cs) and answers it.</summary>
		public byte[] Call( ReadOnlySpan<byte> request ) => Bridge.Serve( request );

		private Container BuildContainer()
		{
			ContainerBuilder builder = new();
			builder.BindInstance( Engine );
			builder.BindInstance( Engine.World );
			builder.BindInstance( Engine.Ui );
			builder.BindInstance( Engine.Log );
			builder.BindInstance( Engine.Time );
			builder.BindInstance( Engine.Input );
			builder.BindInstance( Engine.Stream );
			builder.BindInstance( Bridge );
			foreach ( Installer installer in Registry.Installers() )
			{
				builder.Install( installer );
			}
			return builder.Build();
		}

		/// <summary>What answers TypeScript: a C# component of the entity implementing the contract, else the container.</summary>
		private object? Resolve( Type contract, int entity )
		{
			// asked on every call from TypeScript: a component found is kept until components come or go (what the
			// container gives is asked of it each time - a transient binding makes a new one)
			if ( _resolved.TryGetValue( (contract, entity), out Component? known ) )
			{
				return known;
			}
			if ( entity != ScriptBridge.NoEntity && Engine.World.Get( entity ) is Entity found )
			{
				foreach ( Component component in found.Components )
				{
					if ( contract.IsInstanceOfType( component ) )
					{
						_resolved[ (contract, entity) ] = component;
						return component;
					}
				}
			}
			return Container.TryResolve( contract );
		}

		private readonly Dictionary<(Type, int), Component> _resolved = new();

		/// <summary>The live components by id.</summary>
		public IReadOnlyDictionary<int, Component> Components => _components;

		/// <summary>Runs a batch of commands and returns the results (MessagePack).</summary>
		public byte[] Run( ReadOnlySpan<byte> commands )
		{
			ScriptResults results = Engine.Results;
			MessagePackReader reader = new MessagePackReader( commands );
			int count = reader.ReadArrayHeader();
			for ( int i = 0; i < count; i++ )
			{
				List<object?> command = reader.Read() as List<object?> ?? throw new FormatException( "A command is an array" );
				Execute( command );
			}
			Engine.Stream.Flush();
			foreach ( Entity entity in Engine.World.Entities.Values )
			{
				if ( entity.Transform.Changed )
				{
					entity.Transform.Changed = false;
					results.Transforms.Add( (entity.Id, entity.Transform.Position, entity.Transform.Rotation) );
				}
			}
			_writer.Reset();
			results.Write( _writer );
			// cleared after, not before: what C# did between phases (TypeScript calling it) goes with this phase
			results.Clear();
			return _writer.WrittenSpan.ToArray();
		}

		private void Execute( List<object?> command )
		{
			switch ( (Command)Integer( command[ 0 ] ) )
			{
			case Command.Create:
				Create( Integer( command[ 1 ] ), Integer( command[ 2 ] ), (string)command[ 3 ]!, (string)command[ 4 ]!, command[ 5 ] as IDictionary<string, object?> );
				break;
			case Command.Lifecycle:
				With( Integer( command[ 1 ] ), component =>
				{
					if ( (Lifecycle)Integer( command[ 2 ] ) == Lifecycle.Awake )
					{
						component.Awake();
					}
					else
					{
						component.Start();
					}
				} );
				break;
			case Command.Hook:
				RunHook( (Hook)Integer( command[ 1 ] ), (float)Convert.ToDouble( command[ 2 ] ) );
				break;
			case Command.Event:
				Entity other = Engine.World.Get( Integer( command[ 3 ] ), (string)command[ 4 ]! );
				OverlapEvent kind = (OverlapEvent)Integer( command[ 2 ] );
				With( Integer( command[ 1 ] ), component =>
				{
					switch ( kind )
					{
					case OverlapEvent.TriggerEnter:
						component.OnTriggerEnter( other );
						break;
					case OverlapEvent.TriggerExit:
						component.OnTriggerExit( other );
						break;
					case OverlapEvent.CollisionEnter:
						component.OnCollisionEnter( other );
						break;
					default:
						component.OnCollisionExit( other );
						break;
					}
				} );
				break;
			case Command.Enabled:
				bool enabled = (bool)command[ 2 ]!;
				With( Integer( command[ 1 ] ), component =>
				{
					component.Enabled = enabled;
					if ( enabled )
					{
						component.OnEnable();
					}
					else
					{
						component.OnDisable();
					}
				} );
				break;
			case Command.Destroy:
				int id = Integer( command[ 1 ] );
				With( id, component => component.OnDestroy() );
				if ( _components.Remove( id, out Component? removed ) )
				{
					_resolved.Clear();
					_order.Remove( id );
					removed.Entity.Components.Remove( removed );
					if ( removed.Entity.Components.Count == 0 )
					{
						Engine.World.Entities.Remove( removed.Entity.Id );
					}
				}
				break;
			case Command.Transforms:
				byte[] transforms = (byte[])command[ 1 ]!;
				for ( int offset = 0; offset < transforms.Length; offset += TransformRecord.Stride * 8 )
				{
					(int entity, Vector3 position, Quaternion rotation) = TransformRecord.Read( transforms.AsSpan( offset ) );
					Engine.World.Get( entity )?.Transform.Set( position, rotation );
				}
				break;
			case Command.Stream:
				_fromTypeScript!( (byte[])command[ 1 ]! );
				break;
			case Command.Input:
				Input input = Engine.Input;
				input.Down = Strings( command[ 1 ] );
				input.Pressed = Strings( command[ 2 ] );
				input.Values.Clear();
				foreach ( KeyValuePair<string, object?> value in (Dictionary<string, object?>)command[ 3 ]! )
				{
					input.Values[ value.Key ] = Convert.ToDouble( value.Value );
				}
				input.MoveVector = new Vector2( (float)Convert.ToDouble( command[ 4 ] ), (float)Convert.ToDouble( command[ 5 ] ) );
				break;
			case Command.Time:
				Engine.Time.Elapsed = Convert.ToDouble( command[ 1 ] );
				Engine.Time.FrameCount = Convert.ToInt64( command[ 2 ] );
				Engine.Time.PhysicsStepCount = Convert.ToInt64( command[ 3 ] );
				break;
			default:
				throw new FormatException( $"Unknown script command {command[ 0 ]}" );
			}
		}

		[UnconditionalSuppressMessage( "Trimming", "IL2072", Justification = "Component types come from the rooted game assembly." )]
		private void Create( int id, int entityId, string entityName, string className, IDictionary<string, object?>? fields )
		{
			Type? type = Registry.Find( className );
			if ( type is null )
			{
				Engine.Results.Errors.Add( (id, $"There is no C# component \"{className}\" (a public, non-abstract Component with a parameterless constructor)") );
				return;
			}
			Entity entity = Engine.World.Get( entityId, entityName );
			Component component = (Component)Activator.CreateInstance( type )!;
			component.Entity = entity;
			Guard( id, () =>
			{
				if ( fields is not null )
				{
					MessageMapper.Populate( component, fields );
				}
				// its [Inject] / [FromTypeScript] fields, before anything of it runs
				Container.Inject( component );
			} );
			entity.Components.Add( component );
			_resolved.Clear();
			// an id given again (a new runtime on the same host) replaces the component, it doesn't run twice
			_order.Remove( id );
			_components[ id ] = component;
			_order.Add( id );
		}

		private void RunHook( Hook hook, float dt )
		{
			Engine.Time.Delta = dt;
			// a copy: components may be destroyed (and created) by the hooks
			foreach ( int id in _order.ToArray() )
			{
				if ( !_components.TryGetValue( id, out Component? component ) || !component.Enabled )
				{
					continue;
				}
				Guard( id, () =>
				{
					switch ( hook )
					{
					case Hook.InputUpdate:
						component.OnInputUpdate( Engine.Input, dt );
						break;
					case Hook.Update:
						component.Update( dt );
						break;
					case Hook.UIUpdate:
						component.OnUIUpdate( dt );
						break;
					default:
						component.OnPhysicsUpdate( dt );
						break;
					}
				} );
			}
		}

		private void With( int id, Action<Component> action )
		{
			if ( _components.TryGetValue( id, out Component? component ) )
			{
				Guard( id, () => action( component ) );
			}
		}

		/// <summary>A component's exception is reported for it and doesn't stop the others.</summary>
		private void Guard( int id, Action action )
		{
			try
			{
				action();
			}
			catch ( Exception error )
			{
				Engine.Results.Errors.Add( (id, $"{error.GetType().Name}: {error.Message}") );
			}
		}

		private static int Integer( object? value ) => checked((int)Convert.ToInt64( value ));

		private static HashSet<string> Strings( object? value )
		{
			HashSet<string> set = new();
			foreach ( object? item in (List<object?>)value! )
			{
				set.Add( (string)item! );
			}
			return set;
		}
	}
}