// Created by Anton Piruev in 2026.
// Any direct commercial use of derivative work is strictly prohibited.

using System;
using System.Collections;
using System.Collections.Concurrent;
using System.Collections.Generic;
using System.Diagnostics.CodeAnalysis;
using System.Globalization;
using System.Linq;
using System.Reflection;

namespace CSEngine.Messaging
{
	/// <summary>
	/// C# types to and from MessagePack's plain data, so a message is just a class, struct or record on this side and a
	/// plain object on the TypeScript side: nobody writes marshalling code.
	/// <para>
	/// A type is written as a map of its public fields and readable properties; read back by matching map keys to
	/// members (exact name first, then ignoring case), through the public parameterless constructor or else the public
	/// constructor with the most parameters (positional records). Enums are numbers (names are accepted when reading),
	/// collections are arrays, string-keyed dictionaries are maps. Members missing from the data keep their defaults;
	/// keys without a member are ignored.
	/// </para>
	/// </summary>
	public static class MessageMapper
	{
		private const DynamicallyAccessedMemberTypes Members =
			DynamicallyAccessedMemberTypes.PublicFields | DynamicallyAccessedMemberTypes.PublicProperties |
			DynamicallyAccessedMemberTypes.PublicConstructors;

		// The members of message types are read through reflection: the types a message is made of are kept by the
		// annotations on the public entry points, and game script assemblies are not trimmed (TrimMode partial).
		private const string Justification = "Message types are rooted: see MessageMapper's remarks.";

		private static readonly ConcurrentDictionary<Type, TypeShape> _shapes = new();

		[ThreadStatic]
		private static MessagePackWriter? _writer;

		/// <summary><paramref name="value"/> as MessagePack.</summary>
		public static byte[] Write<[DynamicallyAccessedMembers( Members )] T>( T value )
		{
			MessagePackWriter writer = _writer ??= new MessagePackWriter();
			writer.Reset();
			WriteValue( writer, value );
			return writer.WrittenSpan.ToArray();
		}

		/// <summary>MessagePack bytes as <typeparamref name="T"/>.</summary>
		public static T Read<[DynamicallyAccessedMembers( Members )] T>( ReadOnlySpan<byte> bytes ) => Convert<T>( MessagePack.Decode( bytes ) );

		/// <summary>Plain data (what <see cref="MessagePack.Decode"/> gives) as <typeparamref name="T"/>.</summary>
		public static T Convert<[DynamicallyAccessedMembers( Members )] T>( object? value ) => (T)Convert( value, typeof( T ) )!;

		/// <summary>
		/// Sets the members of an existing object from a map (as reading would; members not in the map are left alone):
		/// how a component gets the fields a scene manifest gives it.
		/// </summary>
		[UnconditionalSuppressMessage( "Trimming", "IL2072", Justification = Justification )]
		public static void Populate( object target, IDictionary<string, object?> map ) => ShapeOf( target.GetType() ).Populate( target, map );

		/// <summary>Writes any value: plain data as it is, other types as maps of their members.</summary>
		[UnconditionalSuppressMessage( "Trimming", "IL2072", Justification = Justification )]
		public static void WriteValue( MessagePackWriter writer, object? value )
		{
			switch ( value )
			{
			case null:
			case bool:
			case string:
			case byte[]:
			case int:
			case long:
			case float:
			case double:
			case uint:
			case ulong:
			case short:
			case ushort:
			case byte:
			case sbyte:
				writer.Write( value );
				return;
			case char character:
				writer.WriteString( character.ToString() );
				return;
			case decimal number:
				writer.WriteDouble( (double)number );
				return;
			case Enum:
				writer.WriteInteger( System.Convert.ToInt64( value, CultureInfo.InvariantCulture ) );
				return;
			case IDictionary dictionary:
				writer.WriteMapHeader( dictionary.Count );
				foreach ( DictionaryEntry entry in dictionary )
				{
					writer.WriteString( entry.Key as string ?? throw new NotSupportedException( "Message maps have string keys" ) );
					WriteValue( writer, entry.Value );
				}
				return;
			case IEnumerable items:
				List<object?> list = items.Cast<object?>().ToList();
				writer.WriteArrayHeader( list.Count );
				foreach ( object? item in list )
				{
					WriteValue( writer, item );
				}
				return;
			default:
				TypeShape shape = ShapeOf( value.GetType() );
				writer.WriteMapHeader( shape.Members.Length );
				foreach ( MemberShape member in shape.Members )
				{
					writer.WriteString( member.Name );
					WriteValue( writer, member.Get( value ) );
				}
				return;
			}
		}

		/// <summary>Plain data as <paramref name="type"/>.</summary>
		[UnconditionalSuppressMessage( "Trimming", "IL2062", Justification = Justification )]
		[UnconditionalSuppressMessage( "Trimming", "IL2067", Justification = Justification )]
		[UnconditionalSuppressMessage( "Trimming", "IL2072", Justification = Justification )]
		[UnconditionalSuppressMessage( "AOT", "IL3050", Justification = Justification )]
		public static object? Convert( object? value, [DynamicallyAccessedMembers( Members )] Type type )
		{
			Type? underlying = Nullable.GetUnderlyingType( type );
			if ( value is null )
			{
				return type.IsValueType && underlying is null ? Activator.CreateInstance( type ) : null;
			}
			type = underlying ?? type;
			if ( type.IsInstanceOfType( value ) )
			{
				return value;
			}
			if ( type.IsEnum )
			{
				return value is string name ? Enum.Parse( type, name ) : Enum.ToObject( type, System.Convert.ToInt64( value, CultureInfo.InvariantCulture ) );
			}
			if ( type.IsPrimitive || type == typeof( decimal ) || type == typeof( string ) )
			{
				return System.Convert.ChangeType( value, type, CultureInfo.InvariantCulture );
			}
			if ( value is IList list )
			{
				if ( type.IsArray )
				{
					Type element = type.GetElementType()!;
					Array array = Array.CreateInstance( element, list.Count );
					for ( int i = 0; i < list.Count; i++ )
					{
						array.SetValue( Convert( list[ i ], element ), i );
					}
					return array;
				}
				if ( GenericArgument( type, typeof( List<> ), typeof( IList<> ), typeof( IReadOnlyList<> ), typeof( IEnumerable<> ), typeof( ICollection<> ), typeof( IReadOnlyCollection<> ) ) is Type item )
				{
					IList result = (IList)Activator.CreateInstance( typeof( List<> ).MakeGenericType( item ) )!;
					foreach ( object? entry in list )
					{
						result.Add( Convert( entry, item ) );
					}
					return result;
				}
			}
			if ( value is IDictionary<string, object?> map )
			{
				if ( type.IsGenericType && type.GetGenericArguments() is [ Type key, Type item ] && key == typeof( string ) &&
					GenericArgument( type, typeof( Dictionary<,> ), typeof( IDictionary<,> ), typeof( IReadOnlyDictionary<,> ) ) is not null )
				{
					IDictionary result = (IDictionary)Activator.CreateInstance( typeof( Dictionary<,> ).MakeGenericType( key, item ) )!;
					foreach ( KeyValuePair<string, object?> entry in map )
					{
						result[ entry.Key ] = Convert( entry.Value, item );
					}
					return result;
				}
				return ShapeOf( type ).Create( map );
			}
			throw new FormatException( $"Can't read {value.GetType().Name} as {type.Name}" );
		}

		/// <summary>The (last) type argument when <paramref name="type"/> is one of the generic definitions.</summary>
		private static Type? GenericArgument( Type type, params Type[] definitions )
		{
			if ( !type.IsGenericType || Array.IndexOf( definitions, type.GetGenericTypeDefinition() ) < 0 )
			{
				return null;
			}
			Type[] arguments = type.GetGenericArguments();
			return arguments[ ^1 ];
		}

		private static TypeShape ShapeOf( [DynamicallyAccessedMembers( Members )] Type type ) => _shapes.GetOrAdd( type, static ( t ) => new TypeShape( t ) );

		private sealed class MemberShape
		{
			public required string Name;
			public required Type Type;
			public required Func<object, object?> Get;
			public Action<object, object?>? Set;
		}

		/// <summary>How a type's members are read and written, found once per type.</summary>
		private sealed class TypeShape
		{
			public readonly MemberShape[] Members;
			private readonly Type _type;
			private readonly ConstructorInfo? _constructor;
			private readonly ParameterInfo[] _parameters;

			[UnconditionalSuppressMessage( "Trimming", "IL2070", Justification = Justification )]
			[UnconditionalSuppressMessage( "Trimming", "IL2075", Justification = Justification )]
			public TypeShape( Type type )
			{
				_type = type;
				List<MemberShape> members = new();
				foreach ( FieldInfo field in type.GetFields( BindingFlags.Public | BindingFlags.Instance ) )
				{
					members.Add( new MemberShape
					{
						Name = field.Name,
						Type = field.FieldType,
						Get = field.GetValue,
						Set = field.IsInitOnly ? null : field.SetValue,
					} );
				}
				foreach ( PropertyInfo property in type.GetProperties( BindingFlags.Public | BindingFlags.Instance ) )
				{
					if ( property.GetMethod is null || property.GetIndexParameters().Length > 0 )
					{
						continue;
					}
					members.Add( new MemberShape
					{
						Name = property.Name,
						Type = property.PropertyType,
						Get = property.GetValue,
						Set = property.SetMethod is { IsPublic: true } ? property.SetValue : null,
					} );
				}
				Members = members.ToArray();

				ConstructorInfo[] constructors = type.GetConstructors();
				_constructor = constructors.FirstOrDefault( c => c.GetParameters().Length == 0 ) ??
					constructors.OrderByDescending( c => c.GetParameters().Length ).FirstOrDefault();
				_parameters = _constructor?.GetParameters() ?? Array.Empty<ParameterInfo>();
			}

			[UnconditionalSuppressMessage( "Trimming", "IL2072", Justification = Justification )]
			[UnconditionalSuppressMessage( "Trimming", "IL2067", Justification = Justification )]
			[UnconditionalSuppressMessage( "Trimming", "IL2077", Justification = Justification )]
			public object Create( IDictionary<string, object?> map )
			{
				object instance;
				if ( _constructor is null )
				{
					// a struct without constructors
					instance = Activator.CreateInstance( _type )!;
				}
				else
				{
					object?[] arguments = new object?[ _parameters.Length ];
					for ( int i = 0; i < _parameters.Length; i++ )
					{
						ParameterInfo parameter = _parameters[ i ];
						arguments[ i ] = Find( map, parameter.Name!, out object? value )
							? Convert( value, parameter.ParameterType )
							: parameter.HasDefaultValue ? parameter.DefaultValue : Convert( null, parameter.ParameterType );
					}
					instance = _constructor.Invoke( arguments );
				}
				Populate( instance, map );
				return instance;
			}

			[UnconditionalSuppressMessage( "Trimming", "IL2077", Justification = Justification )]
			public void Populate( object instance, IDictionary<string, object?> map )
			{
				foreach ( MemberShape member in Members )
				{
					if ( member.Set is not null && Find( map, member.Name, out object? value ) )
					{
						member.Set( instance, Convert( value, member.Type ) );
					}
				}
			}

			private static bool Find( IDictionary<string, object?> map, string name, out object? value )
			{
				if ( map.TryGetValue( name, out value ) )
				{
					return true;
				}
				foreach ( KeyValuePair<string, object?> entry in map )
				{
					if ( string.Equals( entry.Key, name, StringComparison.OrdinalIgnoreCase ) )
					{
						value = entry.Value;
						return true;
					}
				}
				return false;
			}
		}
	}
}