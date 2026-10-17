// Created by Anton Piruev in 2026.
// Any direct commercial use of derivative work is strictly prohibited.

using System.Collections.Generic;
using System.Numerics;

namespace CSEngine
{
	/// <summary>
	/// An entity as C# sees it: its id and name, its transform (kept in step with the TypeScript one around every phase)
	/// and its C# components. The others it meets (in collisions and triggers) come with their id and name.
	/// </summary>
	public sealed class Entity
	{
		internal readonly List<Component> Components = new();

		internal Entity( ScriptEngine engine, int id, string name )
		{
			Engine = engine;
			Id = id;
			Name = name;
			Transform = new Transform();
		}

		public int Id { get; }

		public string Name { get; internal set; }

		public Transform Transform { get; }

		public ScriptEngine Engine { get; }

		/// <summary>Its first C# component of this type, or null.</summary>
		public T? GetComponent<T>() where T : Component
		{
			foreach ( Component component in Components )
			{
				if ( component is T typed )
				{
					return typed;
				}
			}
			return null;
		}

		/// <summary>Asks the engine to destroy the entity (at the end of the phase, as in TypeScript).</summary>
		public void Destroy() => Engine.Results.DestroyedEntities.Add( Id );

		public override string ToString() => $"{Name} #{Id}";
	}

	/// <summary>Position and rotation of an entity; what a component changes goes back to the engine after the phase.</summary>
	public sealed class Transform
	{
		private Vector3 _position;
		private Quaternion _rotation = Quaternion.Identity;

		public Vector3 Position
		{
			get => _position;
			set
			{
				_position = value;
				Changed = true;
			}
		}

		public Quaternion Rotation
		{
			get => _rotation;
			set
			{
				_rotation = value;
				Changed = true;
			}
		}

		/// <summary>Changed by C# since the engine last set it.</summary>
		internal bool Changed;

		/// <summary>The engine's values (not a change).</summary>
		internal void Set( Vector3 position, Quaternion rotation )
		{
			_position = position;
			_rotation = rotation;
		}
	}

	/// <summary>The entities C# knows: those with C# components and those they met.</summary>
	public sealed class World
	{
		private readonly ScriptEngine _engine;
		internal readonly Dictionary<int, Entity> Entities = new();

		internal World( ScriptEngine engine )
		{
			_engine = engine;
		}

		/// <summary>The entity with this name, or null.</summary>
		public Entity? Find( string name )
		{
			foreach ( Entity entity in Entities.Values )
			{
				if ( entity.Name == name )
				{
					return entity;
				}
			}
			return null;
		}

		/// <summary>The entity with this id, or null.</summary>
		public Entity? Get( int id ) => Entities.GetValueOrDefault( id );

		internal Entity Get( int id, string name )
		{
			if ( !Entities.TryGetValue( id, out Entity? entity ) )
			{
				entity = new Entity( _engine, id, name );
				Entities[ id ] = entity;
			}
			entity.Name = name;
			return entity;
		}
	}
}