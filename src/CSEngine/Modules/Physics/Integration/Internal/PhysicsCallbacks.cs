// Created by Anton Piruev in 2026.
// Any direct commercial use of derivative work is strictly prohibited.

using CSPhysics;
using CSPhysics.Collidables;
using CSPhysics.CollisionDetection;
using CSPhysics.Constraints;
using CSPhysics.Utilities;

using FastMath;

using System.Collections.Generic;
using System.Numerics;
using System.Runtime.CompilerServices;

namespace Physics.Internal
{
	/// <summary>
	/// Thread-safe sink that the narrow phase callbacks push overlapping pairs into during
	/// collision detection. <see cref="PhysicsWorld"/> drains it after each Timestep call to
	/// diff against the previous frame's set and produce <see cref="OverlapEvent"/>s.
	/// </summary>
	internal sealed class ContactPairSink
	{
		private readonly object _lock = new object();
		private List<ContactPairKey> _filling = new List<ContactPairKey>( 256 );
		private List<ContactPairKey> _drained = new List<ContactPairKey>( 256 );

		[MethodImpl( MethodImplOptions.AggressiveInlining )]
		public void Report( ContactPairKey key )
		{
			lock ( _lock )
			{
				_filling.Add( key );
			}
		}

		/// <summary>The pairs reported since the last call. Two lists take turns, so nothing is allocated per step.</summary>
		public List<ContactPairKey> DrainAndReset()
		{
			lock ( _lock )
			{
				(_filling, _drained) = (_drained, _filling);
				_filling.Clear();
				return _drained;
			}
		}
	}

	/// <summary>Standard gravity + linear/angular damping pose integration.</summary>
	internal struct PoseIntegratorCallbacks : IPoseIntegratorCallbacks
	{
		public Vector3 Gravity;
		public float LinearDamping;
		public float AngularDamping;

		public PoseIntegratorCallbacks( Vector3 gravity, float linearDamping = 0.03f, float angularDamping = 0.03f )
		{
			Gravity = gravity;
			LinearDamping = linearDamping;
			AngularDamping = angularDamping;
			_gravityWideDt = default;
			_linearDampingDt = default;
			_angularDampingDt = default;
		}

		public readonly AngularIntegrationMode AngularIntegrationMode => AngularIntegrationMode.Nonconserving;
		public readonly bool AllowSubstepsForUnconstrainedBodies => false;
		public readonly bool IntegrateVelocityForKinematics => false;

		public void Initialize( Simulation simulation ) { }

		private Vector3Wide _gravityWideDt;
		private Vector<float> _linearDampingDt;
		private Vector<float> _angularDampingDt;

		public void PrepareForIntegration( float dt )
		{
			_linearDampingDt = new Vector<float>( FMath.FastPow( FMath.Clamp( 1 - LinearDamping, 0, 1 ), dt ) );
			_angularDampingDt = new Vector<float>( FMath.FastPow( FMath.Clamp( 1 - AngularDamping, 0, 1 ), dt ) );
			_gravityWideDt = Vector3Wide.Broadcast( Gravity * dt );
		}

		public void IntegrateVelocity( Vector<int> bodyIndices, Vector3Wide position, QuaternionWide orientation,
			BodyInertiaWide localInertia, Vector<int> integrationMask, int workerIndex, Vector<float> dt,
			ref BodyVelocityWide velocity )
		{
			velocity.Linear = ( velocity.Linear + _gravityWideDt ) * _linearDampingDt;
			velocity.Angular = velocity.Angular * _angularDampingDt;
		}

	}

	/// <summary>
	/// Narrow phase callbacks implementing:
	///   - Collision-layer/mask filtering via <see cref="CollidableUserData"/>.
	///   - Triggers: no contacts at all (see the TriggerSystem).
	///   - Overlap reporting for ALL touching pairs into a <see cref="ContactPairSink"/>.
	/// </summary>
	internal struct NarrowPhaseCallbacks : INarrowPhaseCallbacks
	{
		public CollidableProperty<CollidableUserData> Properties;
		public ContactPairSink Sink;
		public SpringSettings ContactSpringiness;
		public float MaximumRecoveryVelocity;
		public float FrictionCoefficient;

		public NarrowPhaseCallbacks(
			CollidableProperty<CollidableUserData> properties,
			ContactPairSink sink,
			float frictionCoefficient,
			float maximumRecoveryVelocity
		)
		{
			Properties = properties;
			Sink = sink;
			ContactSpringiness = new SpringSettings( 30, 1 );
			MaximumRecoveryVelocity = maximumRecoveryVelocity;
			FrictionCoefficient = frictionCoefficient;
		}

		public void Initialize( Simulation simulation ) => Properties.Initialize( simulation );

		[MethodImpl( MethodImplOptions.AggressiveInlining )]
		internal CollidableUserData GetData( CollidableReference reference ) =>
			reference.Mobility == CollidableMobility.Static ? Properties[ reference.StaticHandle ] : Properties[ reference.BodyHandle ];

		[MethodImpl( MethodImplOptions.AggressiveInlining )]
		public bool AllowContactGeneration(
			int workerIndex,
			CollidableReference a,
			CollidableReference b,
			ref float speculativeMargin
		)
		{
			CollidableUserData dataA = GetData( a );
			CollidableUserData dataB = GetData( b );
			if ( !dataA.CanInteractWith( dataB ) )
			{
				return false;
			}

			// Triggers never reach the narrow phase: their overlaps are the TriggerSystem's (as Box3D's sensors), so a trigger
			// costs no contact generation and never pushes anything.
			if ( dataA.Kind == PhysicsObjectKind.Trigger || dataB.Kind == PhysicsObjectKind.Trigger )
			{
				return false;
			}

			return a.Mobility == CollidableMobility.Dynamic || b.Mobility == CollidableMobility.Dynamic;
		}

		[MethodImpl( MethodImplOptions.AggressiveInlining )]
		public bool AllowContactGeneration(
			int workerIndex,
			CollidablePair pair,
			int childIndexA,
			int childIndexB
		) => true;

		[MethodImpl( MethodImplOptions.AggressiveInlining )]
		public bool ConfigureContactManifold<TManifold>(
			int workerIndex,
			CollidablePair pair,
			ref TManifold manifold,
			out PairMaterialProperties pairMaterial
		)
			where TManifold : unmanaged, IContactManifold<TManifold>
		{
			pairMaterial.FrictionCoefficient = FrictionCoefficient;
			pairMaterial.MaximumRecoveryVelocity = MaximumRecoveryVelocity;
			pairMaterial.SpringSettings = ContactSpringiness;

			if ( manifold.Count > 0 )
			{
				Sink.Report( new ContactPairKey( pair.A.Packed, pair.B.Packed ) );
			}

			return true;
		}

		[MethodImpl( MethodImplOptions.AggressiveInlining )]
		public bool ConfigureContactManifold(
			int workerIndex,
			CollidablePair pair,
			int childIndexA,
			int childIndexB,
			ref ConvexContactManifold manifold
		   ) => true;

		public void Dispose() => Properties.Dispose();
	}
}