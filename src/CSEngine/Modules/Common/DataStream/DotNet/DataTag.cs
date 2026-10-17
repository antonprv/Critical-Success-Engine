// Created by Anton Piruev in 2026.
// Any direct commercial use of derivative work is strictly prohibited.

using System.Collections.Generic;

namespace CSEngine.Messaging
{
	/// <summary>
	/// The label a message travels under (the twin of Source/DataTag.ts). Publishers and subscribers share only the tag.
	/// Tags are interned by name, with a small integer id, so a delivery is an array lookup; <typeparamref name="T"/> is
	/// how this side reads the message (the same name can be read as different types).
	/// </summary>
	public sealed class DataTag<T>
	{
		internal DataTag( string name, int id )
		{
			Name = name;
			Id = id;
		}

		public string Name { get; }

		public int Id { get; }

		public override string ToString() => Name;
	}

	/// <summary>Where tags come from.</summary>
	public static class DataTag
	{
		private static readonly Dictionary<string, int> _ids = new();
		private static readonly List<string> _names = new();
		private static readonly object _lock = new();

		/// <summary>The tag of this name read as <typeparamref name="T"/>.</summary>
		public static DataTag<T> For<T>( string name ) => Cache<T>.For( name );

		/// <summary>The id of this name (made on first use).</summary>
		public static int IdOf( string name )
		{
			lock ( _lock )
			{
				if ( !_ids.TryGetValue( name, out int id ) )
				{
					id = _names.Count;
					_ids[ name ] = id;
					_names.Add( name );
				}
				return id;
			}
		}

		public static string NameOf( int id )
		{
			lock ( _lock )
			{
				return _names[ id ];
			}
		}

		private static class Cache<T>
		{
			private static readonly Dictionary<string, DataTag<T>> _tags = new();

			public static DataTag<T> For( string name )
			{
				lock ( _tags )
				{
					if ( !_tags.TryGetValue( name, out DataTag<T>? tag ) )
					{
						tag = new DataTag<T>( name, IdOf( name ) );
						_tags[ name ] = tag;
					}
					return tag;
				}
			}
		}
	}
}