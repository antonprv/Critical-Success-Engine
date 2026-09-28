// Created by Anton Piruev in 2026.
// Any direct commercial use of derivative work is strictly prohibited.

// Hand-written ambient types for LogServerSidecar.mjs - it stays plain JS
// (see that file's own doc comment for why), but this lets LogServerPlugin.ts
// import it under tsconfig.node.json without needing allowJs project-wide.

export function StartLogServerSidecar(): Promise<void>;
export function StopLogServerSidecar(): void;
