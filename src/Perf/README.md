# Perf

The perf harness's test projects (`src/CSEngine/Core/Perf`, `pnpm perf` in `src/CSEngine/Core`). `PerfSuite` has one
scene per kind of load: empty, 10 000 entities, 100 000 triangles, 2 000 physics bodies, C# and TypeScript calling each
other, a busy UI. Results go to `perf/` at the repository root.
