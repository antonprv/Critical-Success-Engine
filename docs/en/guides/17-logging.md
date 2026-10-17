**English** | [Русский](../../ru/guides/17-logging.md)

# 17. Logging

The engine and your scripts log through one class, `Logger` (`Core/Source/Logging/Logger.ts`). It writes to the browser console and, on a local dev server, can also send the lines to a log sidecar that keeps them in a file. This guide covers the levels, what disappears from a production build, how a line gets from a worker to the sidecar, and how the tests use the log.

## Writing to the log

```ts
Logger.LogInfo("Scene loaded");
Logger.LogWarning("Texture is larger than 2048 px");
Logger.LogError("Physics did not answer in time");
Logger.LogDebug(`Spawned ${count} balls`);
Logger.LogValue("Health", 40);                        // "Set Health to 40"

try {
	LoadSomething();
} catch (error) {
	Logger.LogException(error, "Loading failed");       // the context line, then the stack (or the message)
}
```

All methods are static; there's nothing to create or inject. Inside components, use `Logger` instead of `console.*`: then the line gets the level, the call site and, in dev, goes to the log file too.

| Call | Level | Console method | In a production build |
|---|---|---|---|
| `LogDebug(message)` | Debug | `console.debug` | dropped |
| `LogInfo(message)` | Info | `console.log` | kept |
| `LogWarning(message)` | Warning | `console.warn` | **dropped** |
| `LogError(message)` | Error | `console.error` | kept |
| `LogException(error, context?)` | Error | `console.error` | kept |
| `LogValue(name, value)` | Debug | `console.debug` | dropped |

"Dropped" means the `__DEV__` flag: it is `true` in the dev server (`pnpm dev`) and in `pnpm build:dev`, and `false` in `pnpm build`, where those calls are removed from the bundle. A warning therefore never reaches players: if something must be visible in a finished build, log it as Info or Error.

## What a line looks like

In the console: `[call site] message`, with the level shown by the console method itself. The call site is the stack frame of the code that called `Logger`, so you can see where the line came from without adding a prefix by hand.

In the sidecar (see below) each line also carries a time and the level name:

```
[2026-10-12T10:58:00.123Z] [Warning] [call site] Texture is larger than 2048 px
```

The levels are `Debug`, `Info`, `Warning`, `Error` (`LogType`).

## Threads

The game runs in the page and in five workers (guide 12 and `ENGINE_ARCHITECTURE.md`). Each is a separate JavaScript realm, so each has its own copy of `Logger`: its own buffer and its own timer. That's why `Logger.SetupAutoFlush()` is called once in each entry file (`App.ts` and the five workers). Messages from every thread show up in the same browser console.

## The log sidecar

A page can't write files by itself, so a small Node process, the **sidecar**, receives the lines and writes them to disk. The path is:

1. A line is buffered **only when the page is on a local host** (`127.0.0.1`, `localhost`, `::1`). A game hosted anywhere else never buffers or sends anything.
2. Every 5 seconds (the `SetupAutoFlush` default), and on closing the page (the page only, not the workers), the buffered lines are sent in one request per thread: `POST http://127.0.0.1:4790/log`, `Content-Type: text/plain`, lines separated by `\n`.
3. The sidecar is started by the Vite dev server: `LogServerPlugin` (`Core/BuildTools/LogServerPlugin.ts`) calls `StartLogServerSidecar` when the server starts. It spawns `Core/Tools/LogServer.mjs` with the same Node, unless that file doesn't exist or something already listens on port 4790. It is stopped together with the server (and on exit, `SIGINT`, `SIGTERM`).

It starts only with a dev server: `pnpm dev`, and **Run - dev** in the Project Manager (guide 16), which starts the same server. `vite preview` and finished builds don't start it.

> **State in this repository.** The file `Core/Tools/LogServer.mjs` is not in the repository, so the sidecar never starts: the plugin silently skips it, and the logs exist only in the console. What the sidecar writes and where is decided by that script; the code in the repository fixes only the contract above (the address, the method, the body).

### If nobody is listening on port 4790

When the request fails, the lines are put back in the buffer (so a sidecar that starts late doesn't lose them) and the console gets a warning: `[Logger] failed to reach log sidecar - is it running? (see Tools/LogServer.mjs)`, where the path is `Core/Tools/LogServer.mjs`. Because the lines come back, every thread retries every 5 seconds, so with no sidecar on a local host you'll see this warning repeat and the buffers grow for as long as the page lives. It doesn't affect the game. Either provide the sidecar, or ignore the warning.

### Writing your own receiver

Anything that listens on `127.0.0.1:4790` will do: accept `POST /log`, split the body by `\n`, and answer with a 2xx status and the header `Access-Control-Allow-Origin: *`. The header matters: the page and port 4790 are different origins, and without it the browser reports the request as failed even though the server got it, so the same lines would be sent again. The stand-in used by the E2E tests (`Core/E2E/support/serve.mjs`) is a working example.

## The log in tests

- **Unit tests** (`Tests/Logger.test.ts`) check the console mapping, the dropping of Debug/Warning/Value in production, buffering on local hosts only, the single batched request, putting lines back on failure, and the auto flush in the page and in a worker.
- **E2E tests** don't use the real sidecar. `E2E/support/serve.mjs` runs a stand-in on port 4790 that keeps every line the game sends (`GET /lines` returns them as JSON, `DELETE` clears them). The test helper (`E2E/support/game.ts`) fails a test if the game's log contains any `[Warning]` or `[Error]` line that the test hasn't explicitly allowed. So a new warning in the game code shows up as a failing E2E test.

## Where to look

| You want | Where |
|---|---|
| To see what the game logged | the browser console (F12); a worker's lines are there too |
| To see debug lines in a built site | `pnpm build:dev` (it turns `__DEV__` on) |
| To log from a component | `Logger.LogInfo/LogWarning/LogError/LogException` |
| To get logs into a file | the sidecar (`Core/Tools/LogServer.mjs`), or your own receiver on port 4790 |
| To find out why a script failed | the console line `[Script] ClassName.Hook threw on entity "..."` (guide 03) |

Next → [18. Components in C#](18-csharp-scripting.md)
