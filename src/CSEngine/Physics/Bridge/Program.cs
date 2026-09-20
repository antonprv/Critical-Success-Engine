// Created by Anton Piruev in 2026.
// Any direct commercial use of derivative work is strictly prohibited.

// Required by the browser-wasm app model: the runtime needs an entry point to
// finish booting before physics.worker.ts can call any [JSExport] method on
// PhysicsBridge. It deliberately does nothing else - all real work happens in
// PhysicsBridge.cs, called from JS after this has returned.

System.Console.WriteLine("[PhysicsBridge] wasm runtime ready.");
