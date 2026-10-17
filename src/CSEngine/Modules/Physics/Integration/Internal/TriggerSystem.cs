// Created by Anton Piruev in 2026.
// Any direct commercial use of derivative work is strictly prohibited.

using CSPhysics;
using CSPhysics.Collidables;
using CSPhysics.CollisionDetection;
using CSPhysics.Utilities;
using CSPhysics.Utilities.Memory;

using FastMath;

using System;
using System.Collections.Generic;
using System.Numerics;


namespace Physics.Internal
{
	/// <summary>
	/// Triggers as Box3D's sensors (box3d/src/sensor.c): they are not in the contact pipeline at all, and once a step each
	/// trigger finds what is inside it. That is cheap - one broad phase query and one exact test per candidate, no
	/// contact manifolds, no constraints - and always right:
	/// <list type="bullet">
	/// <item>a sleeping body stays inside (sleeping bodies are still in the broad phase), so it never exits by falling asleep;</item>
	/// <item>a trigger moved onto a sleeping body finds it (the query uses the trigger's pose, not the solver's state);</item>
	/// <item>a body that goes away, or a trigger removed, exits; a handle taken by a new body is a new visitor;</item>
	/// <item>a fast body with continuous detection that crossed a trigger within one step is caught by a sweep from where it
	/// was to where it is: it enters that step and exits the next.</item>
	/// </list>
	/// Triggers detect bodies (dynamic and kinematic) that pass the layer filter, not statics and not other triggers.
	/// Each trigger keeps its visitors sorted, so the events come from a merge of two sorted lists. Nothing is allocated
	/// per step once the lists have grown.
	/// </summary>
	internal sealed class TriggerSystem
	{
		/// <summary>A body inside a trigger: its packed reference and generation (one sort key), and its owner.</summary>
		private readonly struct Visitor : IComparable<Visitor>
		{
			public readonly ulong Key;
			public readonly int OwnerId;

			public Visitor( CollidableReference collidable, uint generation, int ownerId )
			{
				Key = ( (ulong)collidable.Packed << 32 ) | generation;
				OwnerId = ownerId;
			}

			public int CompareTo( Visitor other ) => Key.CompareTo( other.Key );
		}

		private sealed class Trigger
		{
			public CollidableReference Collidable;
			public CollidableUserData Data;
			public List<Visitor> Previous = new List<Visitor>();
			public List<Visitor> Current = new List<Visitor>();

			/// <summary>Fast bodies caught by a sweep this step (inside for this step only).</summary>
			public readonly List<Visitor> Hits = new List<Visitor>();
		}

		/// <summary>A fast body's pose at the start of the step.</summary>
		private struct Start
		{
			public CSPhysics.BodyHandle Body;
			public uint Generation;
			public RigidPose Pose;
		}

		/// <summary>Collects broad phase candidates into a list the system keeps.</summary>
		private struct Collector : IBreakableForEach<CollidableReference>
		{
			public List<CollidableReference> Found;

			public bool LoopBody( CollidableReference collidable )
			{
				Found.Add( collidable );
				return true;
			}
		}

		/// <summary>Lets every child of a compound (a mesh's triangles) be swept against.</summary>
		private struct AllChildren : ISweepFilter
		{
			public bool AllowTest( int childA, int childB ) => true;
		}

		private readonly Simulation _simulation;
		private readonly BufferPool _pool;
		private readonly CollidableView _view;
		private readonly List<Trigger> _triggers = new List<Trigger>();
		private readonly Dictionary<uint, Trigger> _byCollidable = new Dictionary<uint, Trigger>();
		private readonly List<Trigger> _removed = new List<Trigger>();
		private readonly List<CollidableReference> _found = new List<CollidableReference>();
		private readonly HashSet<int> _continuous = new HashSet<int>();
		private readonly List<Start> _starts = new List<Start>();

		public TriggerSystem( Simulation simulation, BufferPool pool, CollidableView view )
		{
			_simulation = simulation;
			_pool = pool;
			_view = view;
		}

		public void AddTrigger( CollidableReference collidable, CollidableUserData data )
		{
			Trigger trigger = new Trigger { Collidable = collidable, Data = data };
			_triggers.Add( trigger );
			_byCollidable[ collidable.Packed ] = trigger;
		}

		/// <summary>A body or static was removed: if it was a trigger, everything in it exits at the next step.</summary>
		public void Removed( CollidableReference collidable )
		{
			if ( collidable.Mobility != CollidableMobility.Static )
			{
				_continuous.Remove( collidable.BodyHandle.Value );
			}
			if ( !_byCollidable.Remove( collidable.Packed, out Trigger? trigger ) )
			{
				return;
			}
			_triggers.Remove( trigger );
			_removed.Add( trigger );
		}

		/// <summary>A body with continuous detection: its path through each step is checked against the triggers.</summary>
		public void AddContinuous( CSPhysics.BodyHandle body ) => _continuous.Add( body.Value );

		/// <summary>Before the step: where the fast bodies start from.</summary>
		public void BeforeStep()
		{
			_starts.Clear();
			if ( _triggers.Count == 0 )
			{
				return;
			}
			foreach ( int handle in _continuous )
			{
				BodyReference body = _simulation.Bodies[ new CSPhysics.BodyHandle( handle ) ];
				CollidableReference collidable = new CollidableReference( body.Kinematic ? CollidableMobility.Kinematic : CollidableMobility.Dynamic, body.Handle );
				_starts.Add( new Start { Body = body.Handle, Generation = _view.Data( collidable ).Generation, Pose = body.Pose } );
			}
		}

		/// <summary>After the step: every trigger's visitors, and the enter and exit events that changed.</summary>
		public void AfterStep( List<OverlapEvent> events )
		{
			foreach ( Trigger trigger in _removed )
			{
				foreach ( Visitor visitor in trigger.Previous )
				{
					events.Add( new OverlapEvent( trigger.Data.OwnerId, visitor.OwnerId, false ) );
				}
			}
			_removed.Clear();

			if ( _triggers.Count == 0 )
			{
				return;
			}

			CollectSweptHits();
			foreach ( Trigger trigger in _triggers )
			{
				FindVisitors( trigger );
				Report( trigger, events );
			}
		}

		private void Pose( CollidableReference collidable, out RigidPose pose, out TypedIndex shape )
		{
			if ( collidable.Mobility == CollidableMobility.Static )
			{
				StaticReference reference = _simulation.Statics[ collidable.StaticHandle ];
				pose = reference.Pose;
				shape = reference.Shape;
				return;
			}
			BodyReference body = _simulation.Bodies[ collidable.BodyHandle ];
			pose = body.Pose;
			shape = body.Collidable.Shape;
		}

		private void FindVisitors( Trigger trigger )
		{
			(trigger.Previous, trigger.Current) = (trigger.Current, trigger.Previous);
			List<Visitor> current = trigger.Current;
			current.Clear();
			current.AddRange( trigger.Hits );
			trigger.Hits.Clear();

			Pose( trigger.Collidable, out RigidPose pose, out TypedIndex shape );
			_simulation.Shapes.UpdateBounds( pose, shape, out BoundingBox bounds );
			_found.Clear();
			Collector collector = new Collector { Found = _found };
			_simulation.BroadPhase.GetOverlaps( bounds, _pool, ref collector );

			foreach ( CollidableReference candidate in _found )
			{
				if ( candidate.Mobility == CollidableMobility.Static || candidate.Packed == trigger.Collidable.Packed )
				{
					continue;
				}
				CollidableUserData data = _view.Data( candidate );
				if ( data.Kind == PhysicsObjectKind.Trigger || !trigger.Data.CanInteractWith( data ) )
				{
					continue;
				}
				if ( _simulation.Overlaps( shape, pose, candidate, _pool ) )
				{
					current.Add( new Visitor( candidate, data.Generation, data.OwnerId ) );
				}
			}

			current.Sort();
			// A swept hit that is also inside now is one visitor.
			int unique = 0;
			for ( int i = 0; i < current.Count; i++ )
			{
				if ( unique == 0 || current[ i ].Key != current[ unique - 1 ].Key )
				{
					current[ unique++ ] = current[ i ];
				}
			}
			current.RemoveRange( unique, current.Count - unique );
		}

		/// <summary>Merges the sorted visitor lists of the last step and this one: who left, who came.</summary>
		private static void Report( Trigger trigger, List<OverlapEvent> events )
		{
			List<Visitor> before = trigger.Previous;
			List<Visitor> now = trigger.Current;
			int owner = trigger.Data.OwnerId;
			int i = 0;
			int j = 0;
			while ( i < before.Count || j < now.Count )
			{
				if ( j == now.Count || ( i < before.Count && before[ i ].Key < now[ j ].Key ) )
				{
					events.Add( new OverlapEvent( owner, before[ i++ ].OwnerId, false ) );
				}
				else if ( i == before.Count || now[ j ].Key < before[ i ].Key )
				{
					events.Add( new OverlapEvent( owner, now[ j++ ].OwnerId, true ) );
				}
				else
				{
					i++;
					j++;
				}
			}
		}

		/// <summary>Sweeps each fast body from its start pose to where it ended against the triggers along the way.</summary>
		private unsafe void CollectSweptHits()
		{
			foreach ( Start start in _starts )
			{
				CollidableReference body = BodyCollidable( start.Body );
				if ( !_view.IsCurrent( body, start.Generation ) )
				{
					continue;
				}
				CollidableUserData data = _view.Data( body );
				Pose( body, out RigidPose end, out TypedIndex shape );
				Vector3 travel = end.Position - start.Pose.Position;
				_simulation.Shapes.UpdateBounds( start.Pose, shape, out BoundingBox from );
				_simulation.Shapes.UpdateBounds( end, shape, out BoundingBox to );
				_found.Clear();
				Collector collector = new Collector { Found = _found };
				_simulation.BroadPhase.GetOverlaps( Vector3.Min( from.Min, to.Min ), Vector3.Max( from.Max, to.Max ), _pool, ref collector );

				foreach ( CollidableReference candidate in _found )
				{
					if ( !_byCollidable.TryGetValue( candidate.Packed, out Trigger? trigger ) || !trigger.Data.CanInteractWith( data ) )
					{
						continue;
					}
					Pose( candidate, out RigidPose triggerPose, out TypedIndex triggerShape );
					if ( Swept( shape, start.Pose, travel, triggerShape, triggerPose, from ) )
					{
						trigger.Hits.Add( new Visitor( body, data.Generation, data.OwnerId ) );
					}
				}
			}
		}

		/// <summary>Whether a shape moving by <paramref name="travel"/> over the step touches the (still) trigger.</summary>
		private unsafe bool Swept( TypedIndex shape, in RigidPose start, Vector3 travel, TypedIndex triggerShape, in RigidPose triggerPose, in BoundingBox bounds )
		{
			SweepTaskRegistry tasks = _simulation.NarrowPhase.SweepTaskRegistry;
			SweepTask? task = tasks.GetTask( shape.Type, triggerShape.Type );
			if ( task == null )
			{
				return false;
			}
			_simulation.Shapes[ shape.Type ].GetShapeData( shape.Index, out void* data, out _ );
			_simulation.Shapes[ triggerShape.Type ].GetShapeData( triggerShape.Index, out void* triggerData, out _ );
			// Precision relative to the body's size, as Simulation.Sweep chooses it.
			Vector3 size = bounds.Max - bounds.Min;
			float sizeEstimate = FMath.Max( 1e-3f, 0.25f * FMath.Min( size.X, FMath.Min( size.Y, size.Z ) ) );
			float inverseLength = 1f / FMath.Max( travel.Length(), 1e-6f );
			AllChildren filter = default;
			return task.Sweep(
				data, shape.Type, start.Orientation, new BodyVelocity { Linear = travel },
				triggerData, triggerShape.Type, triggerPose.Position - start.Position, triggerPose.Orientation, default,
				1f, 0.1f * sizeEstimate * inverseLength, 1e-5f * sizeEstimate * inverseLength, 25,
				ref filter, _simulation.Shapes, tasks, _pool, out _, out _, out _, out _ );
		}

		private CollidableReference BodyCollidable( CSPhysics.BodyHandle handle )
		{
			if ( !_simulation.Bodies.BodyExists( handle ) )
			{
				return new CollidableReference( CollidableMobility.Dynamic, handle );
			}
			return new CollidableReference( _simulation.Bodies[ handle ].Kinematic ? CollidableMobility.Kinematic : CollidableMobility.Dynamic, handle );
		}
	}
}