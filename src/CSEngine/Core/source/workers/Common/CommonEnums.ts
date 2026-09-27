export enum PhysShape {
    Box = 0,
    Sphere,
    Capsule,
    Cylinder
}

export enum PhysOpType {
    SpawnDynamicBody = 0,
    SpawnStaticBody,
    RemoveBody,
    ApplyImpulse,
    SetVelocity
}

export enum RendMesh {
    Sphere = 0,
    Box,
    Gltf
}

export enum RendOpType {
    SpawnEntity = 0,
    RemoveEntity,
    TransformBatch,
    PoseCamera
}

export enum InputEvtType {
    KeyDown = 0,
    KeyUp,
    PointerMove,
    PointerDown,
    PointerUp
}
