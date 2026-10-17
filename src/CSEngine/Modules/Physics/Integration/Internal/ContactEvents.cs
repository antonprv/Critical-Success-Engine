// Created by Anton Piruev in 2026.
// Any direct commercial use of derivative work is strictly prohibited.

using CSPhysics;
using CSPhysics.Collidables;

using FastMath;

using System;
using System.Collections.Generic;

namespace Physics.Internal
{
	/// <summary>
	/// What the events need to know about a collidable that may be gone by now: whether it still exists as the same
	/// collidable (its handle may have been taken by a new one), its data, whether it is awake.
	/// </summary>
	internal sealed class CollidableView
	{
		private readonly Simulation _simulation;
		private readonly NarrowPhaseCallbacks _callbacks;

		public CollidableView( Simulation simulation, NarrowPhaseCallbacks callbacks )
		{
			_simulation = simulation;
			_callbacks = callbacks;
		}

		public bool Exists( CollidableReference collidable ) =>
			collidable.Mobility == CollidableMobility.Static
				? _simulation.Statics.StaticExists( collidable.StaticHandle )
				: _simulation.Bodies.BodyExists( collidable.BodyHandle );

		/// <summary>The collidable exists and is the one that had this generation.</summary>
		public bool IsCurrent( CollidableReference collidable, uint generation ) =>
			Exists( collidable ) && Data( collidable ).Generation == generation;

		public CollidableUserData Data( CollidableReference collidable ) => _callbacks.GetData( collidable );

		/// <summary>Statics never are; a body is when it is in the active set (not asleep).</summary>
		public bool IsAwake( CollidableReference collidable ) =>
			collidable.Mobility != CollidableMobility.Static &&
			_simulation.Bodies.HandleToLocation[ collidable.BodyHandle.Value ].SetIndex == 0;

		public static CollidableReference FromPacked( uint packed )
		{
			CollidableReference collidable = default;
			collidable.Packed = packed;
			return collidable;
		}
	}

	/// <summary>
	/// Enter and exit events of touching (solid) pairs, from the pairs the narrow phase reported this step. A pair the
	/// narrow phase stops reporting because both sides fell asleep still touches: it ends only when the contact does, or
	/// when one side goes away.
	/// <para>
	/// The pairs live in sorted arrays (a pair is one 64-bit key: its two packed references) and a step is one merge of
	/// last step's and this step's, as Box3D's sensor events: no hashing, which is what thousands of pairs a step cost
	/// in the wasm build, and nothing allocated once the arrays have grown.
	/// </para>
	/// </summary>
	internal sealed class ContactEvents
	{
		private struct Pair
		{
			public uint GenerationA;
			public uint GenerationB;
			public int OwnerA;
			public int OwnerB;
		}

		private ulong[] _previousKeys = new ulong[ 256 ];
		private Pair[] _previousPairs = new Pair[ 256 ];
		private int _previousCount;

		private ulong[] _reported = new ulong[ 256 ];

		private ulong[] _nextKeys = new ulong[ 256 ];
		private Pair[] _nextPairs = new Pair[ 256 ];
		private int _nextCount;

		/// <param name="reported">The pairs the narrow phase reported touching this step.</param>
		/// <param name="view">The collidables.</param>
		/// <param name="events">Where the events go.</param>
		/// <param name="removals">Whether a body or static was removed since the last update. A handle can only be taken by
		/// a new collidable after one was removed, so without removals a pair that touched before is the same pair, and
		/// its record is reused without reading either side's data.</param>
		public void Update( List<ContactPairKey> reported, CollidableView view, List<OverlapEvent> events, bool removals )
		{
			int reportedCount = Sorted( reported );
			int capacity = _previousCount + reportedCount;
			Grow( ref _nextKeys, capacity );
			Grow( ref _nextPairs, capacity );
			_nextCount = 0;

			int i = 0;
			int j = 0;
			while ( i < _previousCount || j < reportedCount )
			{
				if ( j == reportedCount || ( i < _previousCount && _previousKeys[ i ] < _reported[ j ] ) )
				{
					// Not reported any more: still touching while both sides sleep, else ended.
					if ( Dormant( _previousKeys[ i ], _previousPairs[ i ], view ) )
					{
						Keep( _previousKeys[ i ], _previousPairs[ i ] );
					}
					else
					{
						Exit( _previousPairs[ i ], events );
					}
					i++;
				}
				else if ( i == _previousCount || _reported[ j ] < _previousKeys[ i ] )
				{
					Pair pair = Read( _reported[ j ], view );
					Keep( _reported[ j ], pair );
					events.Add( new OverlapEvent( pair.OwnerA, pair.OwnerB, true ) );
					j++;
				}
				else
				{
					Pair before = _previousPairs[ i ];
					if ( removals )
					{
						Pair now = Read( _reported[ j ], view );
						if ( now.GenerationA != before.GenerationA || now.GenerationB != before.GenerationB )
						{
							// The same handles, but other collidables: the old pair ended and the new one began.
							Exit( before, events );
							events.Add( new OverlapEvent( now.OwnerA, now.OwnerB, true ) );
						}
						before = now;
					}
					Keep( _reported[ j ], before );
					i++;
					j++;
				}
			}

			(_previousKeys, _nextKeys) = (_nextKeys, _previousKeys);
			(_previousPairs, _nextPairs) = (_nextPairs, _previousPairs);
			_previousCount = _nextCount;
		}

		/// <summary>The reported pairs as sorted, distinct keys in <see cref="_reported"/>; returns how many.</summary>
		private int Sorted( List<ContactPairKey> reported )
		{
			Grow( ref _reported, reported.Count );
			for ( int k = 0; k < reported.Count; k++ )
			{
				_reported[ k ] = ( (ulong)reported[ k ].PackedA << 32 ) | reported[ k ].PackedB;
			}
			Array.Sort( _reported, 0, reported.Count );
			int unique = 0;
			for ( int k = 0; k < reported.Count; k++ )
			{
				if ( unique == 0 || _reported[ k ] != _reported[ unique - 1 ] )
				{
					_reported[ unique++ ] = _reported[ k ];
				}
			}
			return unique;
		}

		private void Keep( ulong key, Pair pair )
		{
			_nextKeys[ _nextCount ] = key;
			_nextPairs[ _nextCount ] = pair;
			_nextCount++;
		}

		private static void Exit( Pair pair, List<OverlapEvent> events ) => events.Add( new OverlapEvent( pair.OwnerA, pair.OwnerB, false ) );

		private static Pair Read( ulong key, CollidableView view )
		{
			CollidableUserData a = view.Data( CollidableView.FromPacked( (uint)( key >> 32 ) ) );
			CollidableUserData b = view.Data( CollidableView.FromPacked( (uint)key ) );
			return new Pair { GenerationA = a.Generation, GenerationB = b.Generation, OwnerA = a.OwnerId, OwnerB = b.OwnerId };
		}

		/// <summary>Both sides are still there, as the same collidables, and neither is awake: the contact holds.</summary>
		private static bool Dormant( ulong key, Pair pair, CollidableView view )
		{
			CollidableReference a = CollidableView.FromPacked( (uint)( key >> 32 ) );
			CollidableReference b = CollidableView.FromPacked( (uint)key );
			return view.IsCurrent( a, pair.GenerationA ) && view.IsCurrent( b, pair.GenerationB ) &&
				!view.IsAwake( a ) && !view.IsAwake( b );
		}

		private static void Grow<T>( ref T[] buffer, int length )
		{
			if ( length > buffer.Length )
			{
				Array.Resize( ref buffer, FMath.Max( length, buffer.Length * 2 ) );
			}
		}
	}
}