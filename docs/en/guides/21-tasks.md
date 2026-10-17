**English** | [Русский](../../ru/guides/21-tasks.md)

# 21. Tasks

The engine's asynchronous operations return a `Task` (`@cse/task`) instead of a Promise: physics queries
(`SweepSphere`, `SweepProjectile`, `IsAwake`), the physics and render sync markers, dialogs and message boxes
(`ShowDialog`, `MessageBox`), showing a UI document, the settings storage. A Task **is a Promise** to everything that
expects one - `await` it, pass it to `Promise.all`, return it where a `Promise<T>` is declared - and adds what a game
needs (after Cysharp's UniTask):

```ts
import { Task, CancellationTokenSource } from "@cse/task";

// wait in frames and game time - the engine's frame clock, not setTimeout
await Task.NextFrame();
await Task.DelayFrames( 10 );
await Task.Delay( 1.5 ); // game seconds

// state without awaiting
const hit = this._physics.SweepSphere( from, direction, 20, 0.5, CollisionLayer.Projectile, CollisionLayer.World );
if ( hit.IsCompleted ) { /* hit.Result */ }

// a continuation that runs the moment it completes - no microtask, no Promise
hit.OnCompleted( ( task ) => this.Aim( task.Result ) );

// cancellation: a canceled wait rejects with OperationCanceledError
const cancel = new CancellationTokenSource();
void Task.Delay( 10, cancel.Token );
cancel.Cancel();
```

Making one is `TaskCompletionSource` (what `new Promise( ( resolve, reject ) => ... )` was): `TrySetResult`,
`TrySetError`, `TrySetCanceled`, optionally tied to a `CancellationToken`. `Task.FromResult`, `Task.FromError`,
`Task.From( promise )`, `Task.WhenAll`, `Task.WhenAny` complete the set.

Why: in V8 awaiting a Task costs what awaiting a Promise does, while a continuation through `OnCompleted` (and `then` on
a completed task) runs synchronously and is about 7x cheaper than `Promise.then`, which always allocates and goes through
the microtask queue. Frame waits complete on the frame they are due, in step with the game, whatever the timers do.

`async` functions still return Promises (the language makes them); they await Tasks like anything else.

← [20. Dependency injection](20-dependency-injection.md) · Next → [22. Contracts](22-contracts.md)
