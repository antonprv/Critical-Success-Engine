// Created by Anton Piruev in 2026.
// Any direct commercial use of derivative work is strictly prohibited.

// Dependency injection for C# scripts: the twin of @cse/di (../Source/DI.ts). Contracts (interfaces) are bound in
// installers, a container per game builds from them, and fields marked [Inject] are filled before a component's Awake.
// A contract is looked up in a dictionary by its type; the fields a class injects are found once per class.

using System;
using System.Collections.Generic;
using System.Diagnostics.CodeAnalysis;
using System.Reflection;

namespace CSEngine.DI
{
	/// <summary>
	/// Marks a field or property to be filled from the container: <c>[Inject] private IScore _score = null!;</c>. Derive
	/// from it for a field resolved another way (<c>[FromTypeScript]</c> does): override <see cref="Resolve"/>.
	/// </summary>
	[AttributeUsage( AttributeTargets.Field | AttributeTargets.Property )]
	public class InjectAttribute : Attribute
	{
		/// <summary>The value for a field of <paramref name="type"/> on <paramref name="target"/>.</summary>
		public virtual object? Resolve( Container container, Type type, object target ) =>
			container.TryResolve( type ) ?? throw new InvalidOperationException( $"{target.GetType().Name}.{Member} needs {type.Name}, and nothing is bound to it" );

		/// <summary>The member being filled (set by the container for error messages).</summary>
		internal string Member { get; set; } = "";
	}

	/// <summary>A singleton the container makes at build (NonLazy) has this called then.</summary>
	public interface IInitializable
	{
		void Initialize();
	}

	/// <summary>A group of bindings: a game's installers install the others (composition).</summary>
	public abstract class Installer
	{
		public abstract void InstallBindings( ContainerBuilder builder );
	}

	internal enum Lifetime
	{
		Single,
		Transient,
	}

	internal sealed class Binding
	{
		public Binding( Type contract )
		{
			Contract = contract;
		}

		public Type Contract { get; }

		public Lifetime Lifetime = Lifetime.Single;
		public bool Eager;
		public Func<Container, object>? Make;

		/// <summary>Given from outside: the container doesn't dispose it.</summary>
		public bool Owned = true;
		public object? Instance;
		public bool Made;
	}

	/// <summary><c>builder.Bind&lt;IScore&gt;()</c>: where it comes from, then how long it lives.</summary>
	public sealed class BindingBuilder<T> where T : class
	{
		private readonly Binding _binding;

		internal BindingBuilder( Binding binding )
		{
			_binding = binding;
		}

		/// <summary>An instance of the class (made with no arguments; its [Inject] fields filled).</summary>
		public BindingBuilder<T> To<TImplementation>() where TImplementation : class, T, new()
		{
			_binding.Make = container => container.Inject( new TImplementation() );
			return this;
		}

		/// <summary>This very object (always a singleton; the container doesn't dispose it).</summary>
		public BindingBuilder<T> FromInstance( T instance )
		{
			_binding.Make = _ => instance;
			_binding.Owned = false;
			return this;
		}

		/// <summary>Whatever the factory returns (it gets the container, to resolve what it needs).</summary>
		public BindingBuilder<T> FromFactory( Func<Container, T> factory )
		{
			_binding.Make = factory;
			return this;
		}

		/// <summary>One instance for the container, made when first resolved (the default).</summary>
		public BindingBuilder<T> AsSingle()
		{
			_binding.Lifetime = Lifetime.Single;
			return this;
		}

		/// <summary>A new instance on every resolve.</summary>
		public BindingBuilder<T> AsTransient()
		{
			_binding.Lifetime = Lifetime.Transient;
			return this;
		}

		/// <summary>One instance, made (and its Initialize() called) when the container is built.</summary>
		public BindingBuilder<T> NonLazy()
		{
			_binding.Lifetime = Lifetime.Single;
			_binding.Eager = true;
			return this;
		}
	}

	/// <summary>Collects bindings, then builds the container.</summary>
	public sealed class ContainerBuilder
	{
		private readonly List<Binding> _bindings = new();
		private readonly HashSet<Type> _installed = new();

		public BindingBuilder<T> Bind<T>() where T : class
		{
			if ( _bindings.Exists( binding => binding.Contract == typeof( T ) ) )
			{
				throw new InvalidOperationException( $"{typeof( T ).Name} is bound twice" );
			}
			Binding binding = new( typeof( T ) );
			_bindings.Add( binding );
			return new BindingBuilder<T>( binding );
		}

		/// <summary>Shorthand for <c>Bind&lt;T&gt;().FromInstance( instance )</c>.</summary>
		public BindingBuilder<T> BindInstance<T>( T instance ) where T : class => Bind<T>().FromInstance( instance );

		/// <summary>Runs another installer's bindings into this builder, once per installer class.</summary>
		public ContainerBuilder Install( Installer installer )
		{
			if ( _installed.Add( installer.GetType() ) )
			{
				installer.InstallBindings( this );
			}
			return this;
		}

		/// <summary>The container (a child of <paramref name="parent"/>, which it falls back to).</summary>
		public Container Build( Container? parent = null )
		{
			foreach ( Binding binding in _bindings )
			{
				if ( binding.Make is null )
				{
					throw new InvalidOperationException( $"{binding.Contract.Name} is bound to nothing (To, FromInstance or FromFactory)" );
				}
			}
			Container container = new( _bindings, parent );
			container.MakeEager();
			return container;
		}
	}

	/// <summary>Resolves contracts: its own bindings, then its parent's.</summary>
	public sealed class Container
	{
		private readonly Dictionary<Type, Binding> _bindings = new();
		private readonly Container? _parent;
		private bool _disposed;

		internal Container( List<Binding> bindings, Container? parent )
		{
			_parent = parent;
			foreach ( Binding binding in bindings )
			{
				_bindings[ binding.Contract ] = binding;
			}
		}

		public bool Has<T>() where T : class => Has( typeof( T ) );

		public bool Has( Type contract ) => Find( contract, out _, out _ );

		public T Resolve<T>() where T : class => (T)Resolve( typeof( T ) );

		public object Resolve( Type contract ) =>
			TryResolve( contract ) ?? throw new InvalidOperationException( $"Nothing is bound to {contract.Name}" );

		public T? TryResolve<T>() where T : class => (T?)TryResolve( typeof( T ) );

		public object? TryResolve( Type contract ) =>
			Find( contract, out Container? container, out Binding? binding ) ? container!.Instance( binding! ) : null;

		/// <summary>Fills the object's [Inject] fields and properties (its base classes' too); returns it.</summary>
		[UnconditionalSuppressMessage( "Trimming", "IL2072", Justification = "Injected classes are the game's (a rooted assembly) or the engine's." )]
		public T Inject<T>( T target ) where T : class
		{
			foreach ( Injection injection in Injection.Of( target.GetType() ) )
			{
				injection.Set( target, injection.Attribute.Resolve( this, injection.Type, target ) );
			}
			return target;
		}

		/// <summary>A container for a narrower scope: its own bindings, falling back to this one's.</summary>
		public Container CreateChild( Action<ContainerBuilder> install )
		{
			ContainerBuilder builder = new();
			install( builder );
			return builder.Build( this );
		}

		/// <summary>Disposes the singletons it made (not instances given to it); resolving afterwards is an error.</summary>
		public void Dispose()
		{
			if ( _disposed )
			{
				return;
			}
			_disposed = true;
			foreach ( Binding binding in _bindings.Values )
			{
				if ( binding.Made && binding.Owned && binding.Instance is IDisposable disposable )
				{
					disposable.Dispose();
				}
			}
		}

		internal void MakeEager()
		{
			foreach ( Binding binding in _bindings.Values )
			{
				if ( binding.Eager && Instance( binding ) is IInitializable initializable )
				{
					initializable.Initialize();
				}
			}
		}

		private bool Find( Type contract, out Container? container, out Binding? binding )
		{
			for ( Container? at = this; at is not null; at = at._parent )
			{
				if ( at._bindings.TryGetValue( contract, out binding ) )
				{
					container = at;
					return true;
				}
			}
			container = null;
			binding = null;
			return false;
		}

		private object Instance( Binding binding )
		{
			if ( _disposed )
			{
				throw new InvalidOperationException( $"The container of {binding.Contract.Name} is disposed" );
			}
			if ( binding.Lifetime == Lifetime.Transient )
			{
				return binding.Make!( this );
			}
			if ( !binding.Made )
			{
				binding.Instance = binding.Make!( this );
				binding.Made = true;
			}
			return binding.Instance!;
		}
	}

	/// <summary>A member a class injects: found once per class (its base classes' first), then set directly.</summary>
	internal sealed class Injection
	{
		private const BindingFlags Members = BindingFlags.Instance | BindingFlags.Public | BindingFlags.NonPublic | BindingFlags.DeclaredOnly;
		private static readonly Dictionary<Type, Injection[]> _cache = new();

		private readonly FieldInfo? _field;
		private readonly PropertyInfo? _property;

		private Injection( InjectAttribute attribute, FieldInfo? field, PropertyInfo? property )
		{
			Attribute = attribute;
			_field = field;
			_property = property;
			Type = field?.FieldType ?? property!.PropertyType;
			attribute.Member = field?.Name ?? property!.Name;
		}

		public InjectAttribute Attribute { get; }

		public Type Type { get; }

		public void Set( object target, object? value )
		{
			if ( _field is not null )
			{
				_field.SetValue( target, value );
			}
			else
			{
				_property!.SetValue( target, value );
			}
		}

		[UnconditionalSuppressMessage( "Trimming", "IL2070", Justification = "Injected classes are the game's (a rooted assembly) or the engine's." )]
		[UnconditionalSuppressMessage( "Trimming", "IL2075", Justification = "Injected classes are the game's (a rooted assembly) or the engine's." )]
		public static Injection[] Of( Type type )
		{
			if ( _cache.TryGetValue( type, out Injection[]? cached ) )
			{
				return cached;
			}
			List<Injection> list = type.BaseType is null ? new() : new( Of( type.BaseType ) );
			foreach ( FieldInfo field in type.GetFields( Members ) )
			{
				if ( field.GetCustomAttribute<InjectAttribute>( true ) is InjectAttribute attribute )
				{
					list.Add( new Injection( attribute, field, null ) );
				}
			}
			foreach ( PropertyInfo property in type.GetProperties( Members ) )
			{
				if ( property.GetCustomAttribute<InjectAttribute>( true ) is InjectAttribute attribute )
				{
					list.Add( new Injection( attribute, null, property ) );
				}
			}
			Injection[] result = list.ToArray();
			_cache[ type ] = result;
			return result;
		}
	}
}