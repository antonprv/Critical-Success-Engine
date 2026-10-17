// Created by Anton Piruev in 2026.
// Any direct commercial use of derivative work is strictly prohibited.

using CSEngine.DI;
using System;
using System.Collections.Generic;
using System.Diagnostics.CodeAnalysis;
using System.Reflection;
using System.Runtime.CompilerServices;

namespace CSEngine
{
	/// <summary>
	/// What the game's assembly brings: the C# component classes a scene can name (every public, concrete Component),
	/// its installers (every public, concrete Installer with a parameterless constructor) and its contracts.
	/// </summary>
	public sealed class ScriptRegistry
	{
		private readonly Dictionary<string, Type> _types = new();
		private readonly List<Type> _installers = new();

		/// <summary>The names scenes can use (simple and full).</summary>
		public IEnumerable<string> Names => _types.Keys;

		// The game's assembly is a trimmer root (Sdk/CSEngine.Game.targets): its types and constructors are kept.
		[UnconditionalSuppressMessage( "Trimming", "IL2026", Justification = "The game assembly is rooted." )]
		[UnconditionalSuppressMessage( "Trimming", "IL2075", Justification = "The game assembly is rooted." )]
		[UnconditionalSuppressMessage( "Trimming", "IL2065", Justification = "The game assembly is rooted." )]
		public void Register( Assembly assembly )
		{
			// its contracts register in its module initializers (the generated .contract.cs files)
			RuntimeHelpers.RunModuleConstructor( assembly.ManifestModule.ModuleHandle );
			foreach ( Type type in assembly.GetExportedTypes() )
			{
				if ( !type.IsAbstract && typeof( Installer ).IsAssignableFrom( type ) && type.GetConstructor( Type.EmptyTypes ) is not null )
				{
					_installers.Add( type );
				}
				if ( type.IsAbstract || !typeof( Component ).IsAssignableFrom( type ) || type.GetConstructor( Type.EmptyTypes ) is null )
				{
					continue;
				}
				_types[ type.FullName! ] = type;
				_types.TryAdd( type.Name, type );
			}
		}

		public Type? Find( string name ) => _types.GetValueOrDefault( name );

		/// <summary>The game's installers, by full name (each is installed once).</summary>
		[UnconditionalSuppressMessage( "Trimming", "IL2072", Justification = "The game assembly is rooted." )]
		public IEnumerable<Installer> Installers()
		{
			_installers.Sort( ( a, b ) => string.CompareOrdinal( a.FullName, b.FullName ) );
			foreach ( Type type in _installers )
			{
				yield return (Installer)Activator.CreateInstance( type )!;
			}
		}
	}
}