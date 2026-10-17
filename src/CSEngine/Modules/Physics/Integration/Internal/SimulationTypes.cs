// Created by Anton Piruev in 2026.
// Any direct commercial use of derivative work is strictly prohibited.

using CSPhysics.Collidables;
using CSPhysics.CollisionDetection;
using CSPhysics.CollisionDetection.CollisionTasks;
using CSPhysics.CollisionDetection.SweepTasks;

namespace Physics.Internal
{
	/// <summary>
	/// The CSPhysics types <see cref="PhysicsWorld"/> actually uses, registered instead of CSPhysics.DefaultTypes.
	/// <para>
	/// Shapes: sphere, capsule, box, cylinder, convex hull, mesh (static only, so no mesh-mesh pair). Triangle pairs stay:
	/// mesh children are triangles and the mesh tasks dispatch to them. No compounds and no joints: the constraint side is
	/// contacts only (DefaultTypes.RegisterContactTypes).
	/// </para>
	/// <para>
	/// Everything not listed here is trimmed before AOT, which is the point (smaller dotnet.native.wasm). Adding a shape
	/// kind or a joint to PhysicsWorld means adding its pairs/constraint type here too, or its collisions silently never run.
	/// </para>
	/// </summary>
	internal static class SimulationTypes
	{
		public static CollisionTaskRegistry CreateCollisionTaskRegistry()
		{
			var registry = new CollisionTaskRegistry();
			registry.Register( new ConvexCollisionTask<Sphere, SphereWide, Sphere, SphereWide, SpherePair, SpherePairWide, Convex1ContactManifoldWide, SpherePairTester>() );
			registry.Register( new ConvexCollisionTask<Sphere, SphereWide, Capsule, CapsuleWide, SphereIncludingPair, SphereIncludingPairWide<Capsule, CapsuleWide>, Convex1ContactManifoldWide, SphereCapsuleTester>() );
			registry.Register( new ConvexCollisionTask<Sphere, SphereWide, Box, BoxWide, SphereIncludingPair, SphereIncludingPairWide<Box, BoxWide>, Convex1ContactManifoldWide, SphereBoxTester>() );
			registry.Register( new ConvexCollisionTask<Sphere, SphereWide, Triangle, TriangleWide, SphereIncludingPair, SphereIncludingPairWide<Triangle, TriangleWide>, Convex1ContactManifoldWide, SphereTriangleTester>() );
			registry.Register( new ConvexCollisionTask<Sphere, SphereWide, Cylinder, CylinderWide, SphereIncludingPair, SphereIncludingPairWide<Cylinder, CylinderWide>, Convex1ContactManifoldWide, SphereCylinderTester>() );
			registry.Register( new ConvexCollisionTask<Sphere, SphereWide, ConvexHull, ConvexHullWide, SphereIncludingPair, SphereIncludingPairWide<ConvexHull, ConvexHullWide>, Convex1ContactManifoldWide, SphereConvexHullTester>() );
			registry.Register( new ConvexCompoundCollisionTask<Sphere, Mesh, ConvexCompoundOverlapFinder<Sphere, SphereWide, Mesh>, ConvexMeshContinuations<Mesh>, MeshReduction>() );
			registry.Register( new ConvexCollisionTask<Capsule, CapsuleWide, Capsule, CapsuleWide, FliplessPair, FliplessPairWide<Capsule, CapsuleWide>, Convex2ContactManifoldWide, CapsulePairTester>() );
			registry.Register( new ConvexCollisionTask<Capsule, CapsuleWide, Box, BoxWide, CollisionPair, ConvexPairWide<Capsule, CapsuleWide, Box, BoxWide>, Convex2ContactManifoldWide, CapsuleBoxTester>() );
			registry.Register( new ConvexCollisionTask<Capsule, CapsuleWide, Triangle, TriangleWide, CollisionPair, ConvexPairWide<Capsule, CapsuleWide, Triangle, TriangleWide>, Convex2ContactManifoldWide, CapsuleTriangleTester>() );
			registry.Register( new ConvexCollisionTask<Capsule, CapsuleWide, Cylinder, CylinderWide, CollisionPair, ConvexPairWide<Capsule, CapsuleWide, Cylinder, CylinderWide>, Convex2ContactManifoldWide, CapsuleCylinderTester>() );
			registry.Register( new ConvexCollisionTask<Capsule, CapsuleWide, ConvexHull, ConvexHullWide, CollisionPair, ConvexPairWide<Capsule, CapsuleWide, ConvexHull, ConvexHullWide>, Convex2ContactManifoldWide, CapsuleConvexHullTester>() );
			registry.Register( new ConvexCompoundCollisionTask<Capsule, Mesh, ConvexCompoundOverlapFinder<Capsule, CapsuleWide, Mesh>, ConvexMeshContinuations<Mesh>, MeshReduction>() );
			registry.Register( new ConvexCollisionTask<Box, BoxWide, Box, BoxWide, FliplessPair, FliplessPairWide<Box, BoxWide>, Convex4ContactManifoldWide, BoxPairTester>() );
			registry.Register( new ConvexCollisionTask<Box, BoxWide, Triangle, TriangleWide, CollisionPair, ConvexPairWide<Box, BoxWide, Triangle, TriangleWide>, Convex4ContactManifoldWide, BoxTriangleTester>() );
			registry.Register( new ConvexCollisionTask<Box, BoxWide, Cylinder, CylinderWide, CollisionPair, ConvexPairWide<Box, BoxWide, Cylinder, CylinderWide>, Convex4ContactManifoldWide, BoxCylinderTester>() );
			registry.Register( new ConvexCollisionTask<Box, BoxWide, ConvexHull, ConvexHullWide, CollisionPair, ConvexPairWide<Box, BoxWide, ConvexHull, ConvexHullWide>, Convex4ContactManifoldWide, BoxConvexHullTester>() );
			registry.Register( new ConvexCompoundCollisionTask<Box, Mesh, ConvexCompoundOverlapFinder<Box, BoxWide, Mesh>, ConvexMeshContinuations<Mesh>, MeshReduction>() );
			registry.Register( new ConvexCollisionTask<Triangle, TriangleWide, Triangle, TriangleWide, FliplessPair, FliplessPairWide<Triangle, TriangleWide>, Convex4ContactManifoldWide, TrianglePairTester>() );
			registry.Register( new ConvexCollisionTask<Triangle, TriangleWide, Cylinder, CylinderWide, CollisionPair, ConvexPairWide<Triangle, TriangleWide, Cylinder, CylinderWide>, Convex4ContactManifoldWide, TriangleCylinderTester>() );
			registry.Register( new ConvexCollisionTask<Triangle, TriangleWide, ConvexHull, ConvexHullWide, CollisionPair, ConvexPairWide<Triangle, TriangleWide, ConvexHull, ConvexHullWide>, Convex4ContactManifoldWide, TriangleConvexHullTester>() );
			registry.Register( new ConvexCompoundCollisionTask<Triangle, Mesh, ConvexCompoundOverlapFinder<Triangle, TriangleWide, Mesh>, ConvexMeshContinuations<Mesh>, MeshReduction>() );
			registry.Register( new ConvexCollisionTask<Cylinder, CylinderWide, Cylinder, CylinderWide, FliplessPair, FliplessPairWide<Cylinder, CylinderWide>, Convex4ContactManifoldWide, CylinderPairTester>() );
			registry.Register( new ConvexCollisionTask<Cylinder, CylinderWide, ConvexHull, ConvexHullWide, CollisionPair, ConvexPairWide<Cylinder, CylinderWide, ConvexHull, ConvexHullWide>, Convex4ContactManifoldWide, CylinderConvexHullTester>() );
			registry.Register( new ConvexCompoundCollisionTask<Cylinder, Mesh, ConvexCompoundOverlapFinder<Cylinder, CylinderWide, Mesh>, ConvexMeshContinuations<Mesh>, MeshReduction>() );
			registry.Register( new ConvexCollisionTask<ConvexHull, ConvexHullWide, ConvexHull, ConvexHullWide, FliplessPair, FliplessPairWide<ConvexHull, ConvexHullWide>, Convex4ContactManifoldWide, ConvexHullPairTester>() );
			registry.Register( new ConvexCompoundCollisionTask<ConvexHull, Mesh, ConvexCompoundOverlapFinder<ConvexHull, ConvexHullWide, Mesh>, ConvexMeshContinuations<Mesh>, MeshReduction>() );
			return registry;
		}

		public static SweepTaskRegistry CreateSweepTaskRegistry()
		{
			var registry = new SweepTaskRegistry();
			registry.Register( new ConvexPairSweepTask<Sphere, SphereWide, Sphere, SphereWide, SpherePairDistanceTester>() );
			registry.Register( new ConvexPairSweepTask<Sphere, SphereWide, Capsule, CapsuleWide, SphereCapsuleDistanceTester>() );
			registry.Register( new ConvexPairSweepTask<Sphere, SphereWide, Cylinder, CylinderWide, SphereCylinderDistanceTester>() );
			registry.Register( new ConvexPairSweepTask<Sphere, SphereWide, Box, BoxWide, SphereBoxDistanceTester>() );
			registry.Register( new ConvexPairSweepTask<Sphere, SphereWide, Triangle, TriangleWide, SphereTriangleDistanceTester>() );
			registry.Register( new ConvexPairSweepTask<Sphere, SphereWide, ConvexHull, ConvexHullWide, GJKDistanceTester<Sphere, SphereWide, SphereSupportFinder, ConvexHull, ConvexHullWide, ConvexHullSupportFinder>>() );
			registry.Register( new ConvexHomogeneousCompoundSweepTask<Sphere, SphereWide, Mesh, Triangle, TriangleWide, ConvexCompoundSweepOverlapFinder<Sphere, Mesh>>() );
			registry.Register( new ConvexPairSweepTask<Capsule, CapsuleWide, Capsule, CapsuleWide, CapsulePairDistanceTester>() );
			registry.Register( new ConvexPairSweepTask<Capsule, CapsuleWide, Cylinder, CylinderWide, GJKDistanceTester<Capsule, CapsuleWide, CapsuleSupportFinder, Cylinder, CylinderWide, CylinderSupportFinder>>() );
			registry.Register( new ConvexPairSweepTask<Capsule, CapsuleWide, Box, BoxWide, CapsuleBoxDistanceTester>() );
			registry.Register( new ConvexPairSweepTask<Capsule, CapsuleWide, Triangle, TriangleWide, GJKDistanceTester<Capsule, CapsuleWide, CapsuleSupportFinder, Triangle, TriangleWide, TriangleSupportFinder>>() );
			registry.Register( new ConvexPairSweepTask<Capsule, CapsuleWide, ConvexHull, ConvexHullWide, GJKDistanceTester<Capsule, CapsuleWide, CapsuleSupportFinder, ConvexHull, ConvexHullWide, ConvexHullSupportFinder>>() );
			registry.Register( new ConvexHomogeneousCompoundSweepTask<Capsule, CapsuleWide, Mesh, Triangle, TriangleWide, ConvexCompoundSweepOverlapFinder<Capsule, Mesh>>() );
			registry.Register( new ConvexPairSweepTask<Cylinder, CylinderWide, Cylinder, CylinderWide, GJKDistanceTester<Cylinder, CylinderWide, CylinderSupportFinder, Cylinder, CylinderWide, CylinderSupportFinder>>() );
			registry.Register( new ConvexPairSweepTask<Cylinder, CylinderWide, Box, BoxWide, GJKDistanceTester<Cylinder, CylinderWide, CylinderSupportFinder, Box, BoxWide, BoxSupportFinder>>() );
			registry.Register( new ConvexPairSweepTask<Cylinder, CylinderWide, Triangle, TriangleWide, GJKDistanceTester<Cylinder, CylinderWide, CylinderSupportFinder, Triangle, TriangleWide, TriangleSupportFinder>>() );
			registry.Register( new ConvexPairSweepTask<Cylinder, CylinderWide, ConvexHull, ConvexHullWide, GJKDistanceTester<Cylinder, CylinderWide, CylinderSupportFinder, ConvexHull, ConvexHullWide, ConvexHullSupportFinder>>() );
			registry.Register( new ConvexHomogeneousCompoundSweepTask<Cylinder, CylinderWide, Mesh, Triangle, TriangleWide, ConvexCompoundSweepOverlapFinder<Cylinder, Mesh>>() );
			registry.Register( new ConvexPairSweepTask<Box, BoxWide, Box, BoxWide, GJKDistanceTester<Box, BoxWide, BoxSupportFinder, Box, BoxWide, BoxSupportFinder>>() );
			registry.Register( new ConvexPairSweepTask<Box, BoxWide, Triangle, TriangleWide, GJKDistanceTester<Box, BoxWide, BoxSupportFinder, Triangle, TriangleWide, TriangleSupportFinder>>() );
			registry.Register( new ConvexPairSweepTask<Box, BoxWide, ConvexHull, ConvexHullWide, GJKDistanceTester<Box, BoxWide, BoxSupportFinder, ConvexHull, ConvexHullWide, ConvexHullSupportFinder>>() );
			registry.Register( new ConvexHomogeneousCompoundSweepTask<Box, BoxWide, Mesh, Triangle, TriangleWide, ConvexCompoundSweepOverlapFinder<Box, Mesh>>() );
			registry.Register( new ConvexPairSweepTask<Triangle, TriangleWide, Triangle, TriangleWide, GJKDistanceTester<Triangle, TriangleWide, TriangleSupportFinder, Triangle, TriangleWide, TriangleSupportFinder>>() );
			registry.Register( new ConvexPairSweepTask<Triangle, TriangleWide, ConvexHull, ConvexHullWide, GJKDistanceTester<Triangle, TriangleWide, TriangleSupportFinder, ConvexHull, ConvexHullWide, ConvexHullSupportFinder>>() );
			registry.Register( new ConvexHomogeneousCompoundSweepTask<Triangle, TriangleWide, Mesh, Triangle, TriangleWide, ConvexCompoundSweepOverlapFinder<Triangle, Mesh>>() );
			registry.Register( new ConvexPairSweepTask<ConvexHull, ConvexHullWide, ConvexHull, ConvexHullWide, GJKDistanceTester<ConvexHull, ConvexHullWide, ConvexHullSupportFinder, ConvexHull, ConvexHullWide, ConvexHullSupportFinder>>() );
			registry.Register( new ConvexHomogeneousCompoundSweepTask<ConvexHull, ConvexHullWide, Mesh, Triangle, TriangleWide, ConvexCompoundSweepOverlapFinder<ConvexHull, Mesh>>() );
			return registry;
		}
	}
}