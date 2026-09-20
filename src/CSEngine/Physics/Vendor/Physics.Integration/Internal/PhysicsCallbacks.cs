// Created by Anton Piruev in 2026.
// Any direct commercial use of derivative work is strictly prohibited.

using BepuPhysics;
using BepuPhysics.Collidables;
using BepuPhysics.CollisionDetection;
using BepuPhysics.Constraints;
using BepuUtilities;

using Framework.FastMath.Numerics;

using System.Collections.Generic;
using System.Numerics;
using System.Runtime.CompilerServices;

namespace Framework.Physics.Internal
{
	/// <summary>
	/// Thread-safe sink that the narrow phase callbacks push overlapping pairs into during
	/// collision detection. <see cref="PhysicsWorld"/> drains it after each Timestep call to
	/// diff against the previous frame's set and produce <see cref="OverlapEvent"/>s.
	/// </summary>
	internal sealed class ContactPairSink
	{
		private readonly object _lock = new object();
		private readonly List<ContactPairKey> _frameOverlaps = new List<ContactPairKey>( 256 );

		[MethodImpl( MethodImplOptions.AggressiveInlining )]
		public void Report( ContactPairKey key )
		{
			lock ( _lock ) { _frameOverlaps.Add( key ); }
		}

		public List<ContactPairKey> DrainAndReset()
		{
			lock ( _lock )
			{
				var result = new List<ContactPairKey>( _frameOverlaps );
				_frameOverlaps.Clear();
				return result;
			}
		}
	}

	/// <summary>Standard gravity + linear/angular damping pose integration.</summary>
	internal struct BepuPoseIntegratorCallbacks : IPoseIntegratorCallbacks
	{
		public Vector3 Gravity;
		public float LinearDamping;
		public float AngularDamping;

		public BepuPoseIntegratorCallbacks( Vector3 gravity, float linearDamping = 0.03f, float angularDamping = 0.03f )
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
	///   - Trigger semantics: pairs where either side is a Trigger still get a contact manifold
	///     (for overlap detection) but never produce a solver constraint.
	///   - Overlap reporting for ALL touching pairs into a <see cref="ContactPairSink"/>.
	/// </summary>
	internal struct BepuNarrowPhaseCallbacks : INarrowPhaseCallbacks
	{
		public CollidableProperty<CollidableUserData> Properties;
		public ContactPairSink Sink;
		public SpringSettings ContactSpringiness;
		public float MaximumRecoveryVelocity;
		public float FrictionCoefficient;

		public BepuNarrowPhaseCallbacks(
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
				return false;

			bool eitherDynamic = a.Mobility == CollidableMobility.Dynamic || b.Mobility == CollidableMobility.Dynamic;
			bool eitherNonSolid = dataA.Kind == PhysicsObjectKind.Trigger || dataB.Kind == PhysicsObjectKind.Trigger;
			return eitherDynamic || eitherNonSolid;
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
				Sink.Report( new ContactPairKey( pair.A.Packed, pair.B.Packed ) );

			CollidableUserData dataA = GetData( pair.A );
			CollidableUserData dataB = GetData( pair.B );
			bool isTriggerPair = dataA.Kind == PhysicsObjectKind.Trigger || dataB.Kind == PhysicsObjectKind.Trigger;
			return !isTriggerPair;
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
