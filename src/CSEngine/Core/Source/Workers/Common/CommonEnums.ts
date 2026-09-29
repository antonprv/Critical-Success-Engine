export const enum PhysShape {
    Box = 0,
    Sphere,
    Capsule,
    Cylinder
}

export const enum PhysOpType {
    SpawnDynamicBody = 0,
    SpawnStaticBody,
    RemoveBody,
    ApplyImpulse,
    SetVelocity
}

export const enum PhysState {
    Ready = 0,
    Transforms,
    OverlapEvents
}

export const enum RendMesh {
    Sphere = 0,
    Box,
    Gltf
}

export const enum RendOpType {
    SpawnEntity = 0,
    RemoveEntity,
    TransformBatch,
    PoseCamera
}

export const enum InputEvtType {
    KeyDown = 0,
    KeyUp,
    PointerMove,
    PointerDown,
    PointerUp
}

export const enum SoundType {
    Pcm = 0,
    Encoded
}

export const enum SoundAction {
    PlaySound = 0,
}
