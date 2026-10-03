// Created by Anton Piruev in 2026.
// Any direct commercial use of derivative work is strictly prohibited.

/** Collidable geometry kinds the physics worker can build (see PhysicsWorld.ResolveShape). */
export const enum PhysShape {
    Box = 0,
    Sphere,
    Capsule,
    Cylinder,
    ConvexHull,
    TriangleMesh
}

export const enum PhysBodyType {
    Static = 0,
    Dynamic,
    Kinematic
}

/** Values match Framework.Physics.PhysicsObjectKind on the C# side - they cross the bridge as a raw int. */
export const enum PhysObjectKind {
    Solid = 0,
    Character = 1,
    Trigger = 2,
    Projectile = 3
}

export const enum PhysOpType {
    SpawnBody = 0,
    RemoveBody,
    SetPose,
    /** Tick-bound: the physics worker derives linear/angular velocity from the pose delta over the step dt. */
    SetKinematicPose,
    SetLinearVelocity,
    SetAngularVelocity,
    ApplyImpulse,
    SetAwake,
    /** Tick-bound: consumed exactly once by the next step (latest command per character wins). */
    MoveCharacter,
    Query,
    ResetWorld,
    Sync
}

export const enum PhysQueryType {
    SweepSphere = 0,
    SweepProjectile,
    AwakeState
}

export const enum PhysState {
    Ready = 0,
    Step,
    QueryResult,
    SyncAck,
    /** The wasm module could not be loaded - there will be no simulation this session. */
    Failed
}

export const enum RendMesh {
    Sphere = 0,
    Box,
    Capsule,
    Cylinder,
    /** Raw triangle soup (flat x,y,z per vertex, 3 vertices per triangle) - used for convex hull / mesh test shapes. */
    Triangles,
    Gltf
}

export const enum RendOpType {
    SpawnEntity = 0,
    RemoveEntity,
    /** One message per rendered frame: the interpolated transform batch + camera pose, answering a frame request. */
    Frame,
    ClearScene,
    SetVisible,
    SetColor,
    SetEnvironment,
    Sync
}

export const enum InputEvtType {
    KeyDown = 0,
    KeyUp,
    PointerMove,
    PointerDown,
    PointerUp,
    /** Window/document lost focus or pointer lock changed: release everything so no key stays "stuck". */
    ReleaseAll
}

export const enum SoundType {
    Pcm = 0,
    Encoded
}

export const enum SoundAction {
    PlaySound = 0,
}
