// Created by Anton Piruev in 2026.
// Any direct commercial use of derivative work is strictly prohibited.

// The perf harness: builds the site like `pnpm build` (with the real physics), opens each scenario's scene in
// Chromium with the frame rate limit and vsync off, warms up, measures several windows and writes
// perf/results/*.json, perf/REPORT.md and (on request) perf/baseline.json at the repository root.
//
//   pnpm perf                          every scenario
//   pnpm perf -- --only coin-hunt      some of them (comma-separated ids)
//   pnpm perf -- --runs 5 --seconds 15 --warmup 5
//   pnpm perf -- --update-baseline     also keep these results as the baseline
//   pnpm perf -- --params aa=off       an experiment: more of the page's switches
//   PERF_CHROMIUM_PATH=/path/chrome    another browser (default: the system Chromium, else Playwright's)
//
// The numbers come from the engine itself (Source/Engine/Diagnostics/PerfProbe.ts): each thread keeps its samples,
// read here with worker.evaluate( () => __csePerf.Take() ).

import { execFileSync } from "node:child_process";
import { existsSync, mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { cpus, totalmem } from "node:os";
import { basename, dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { chromium } from "playwright-core";
import { build, preview } from "vite";
import { Combine, Compare, Summarize } from "./Metrics.mjs";
import { Pending, Scenarios, TargetFps } from "./Scenarios.mjs";

const Core = resolve( dirname( fileURLToPath( import.meta.url ) ), ".." );
const Repository = resolve( Core, "../../.." );
const Output = join( Repository, "perf" );

//#region options

function Option( name, fallback ) {
	const index = process.argv.indexOf( `--${ name }` );
	return index < 0 ? fallback : process.argv[index + 1];
}

const Runs = Number( Option( "runs", "3" ) );
const Seconds = Number( Option( "seconds", "10" ) );
const Warmup = Number( Option( "warmup", "3" ) );
const Only = Option( "only", "" ).split( "," ).filter( Boolean );
const UpdateBaseline = process.argv.includes( "--update-baseline" );
const Headless = process.argv.includes( "--headless" );
/** More of the page's switches for an experiment (e.g. "aa=off"). */
const Params = Option( "params", "" );
const Viewport = { width: 1280, height: 720 };

/**
 * Chromium switches: no throttling of a page that isn't focused, the GPU even if Chromium distrusts it. No
 * --disable-frame-rate-limit / --disable-gpu-vsync: the page's ?uncapped doesn't draw on the display's clock
 * anyway, and with them Chromium's compositor spins a whole core (hundreds of thousands of tasks a second), taken
 * from the game's workers - the physics step was 11 ms with them, 8 without.
 */
export const UncappedFlags = [
	"--disable-background-timer-throttling",
	"--disable-renderer-backgrounding",
	"--disable-backgrounding-occluded-windows",
	"--ignore-gpu-blocklist",
	"--enable-gpu-rasterization",
];

function Browser() {
	const candidates = [process.env["PERF_CHROMIUM_PATH"], "/snap/bin/chromium", "/usr/bin/chromium", "/usr/bin/google-chrome"];
	return candidates.find( ( path ) => path && existsSync( path ) );
}

//#endregion

//#region the machine

function Machine() {
	const run = ( command, args ) => {
		try {
			return execFileSync( command, args, { encoding: "utf8" } ).trim();
		} catch {
			return "";
		}
	};
	const power = run( "sh", ["-c", "cat /sys/class/power_supply/*/online 2>/dev/null | head -1"] );
	return {
		cpu: cpus()[0]?.model ?? "?",
		threads: cpus().length,
		memoryGb: Number( ( totalmem() / 2 ** 30 ).toFixed( 1 ) ),
		gpu: run( "sh", ["-c", "lspci 2>/dev/null | grep -iE 'vga|3d|display' | cut -d: -f3-"] ),
		acPower: power === "" ? null : power === "1",
		os: run( "uname", ["-sr"] ),
	};
}

//#endregion

//#region the site

/** Builds a project (null: the Games Sample) and serves it; returns its address and a stop function. */
async function Serve( project, port ) {
	const out = join( Core, ".perf", project ? basename( project ) : "GamesSample", "dist" );
	if ( project ) {
		process.env["CSE_PROJECT"] = project;
	}
	else {
		delete process.env["CSE_PROJECT"];
	}
	delete process.env["PHYSICS_WASM_DIR"]; // the real physics, where `pnpm build` takes it from
	await build( { root: Core, configFile: join( Core, "vite.config.ts" ), build: { outDir: out, emptyOutDir: true }, logLevel: "warn" } );
	const server = await preview( {
		root: Core, configFile: join( Core, "vite.config.ts" ), build: { outDir: out },
		preview: { port, host: "127.0.0.1", strictPort: true }, logLevel: "warn",
	} );
	return { url: `http://127.0.0.1:${ port }/`, stop: () => server.close() };
}

//#endregion

//#region measuring

/** Every engine thread's probe (render, game logic, physics) by name. */
async function Probes( page ) {
	const probes = {};
	for ( const worker of page.workers() ) {
		const thread = await worker.evaluate( () => globalThis.__csePerf?.Thread ?? null ).catch( () => null );
		if ( thread ) {
			probes[thread] = worker;
		}
	}
	return probes;
}

async function Take( probes, thread ) {
	return probes[thread] ? probes[thread].evaluate( () => globalThis.__csePerf.Take() ) : {};
}

/** Memory: the page's JS heap, the .NET heaps (physics, C# scripts) in MB. */
async function Memory( page, probes ) {
	const heapOf = ( worker ) => worker?.evaluate( () => globalThis.getDotnetRuntime?.( 0 )?.Module?.HEAPU8?.length ?? null ).catch( () => null ) ?? null;
	const mb = ( bytes ) => ( bytes == null ? null : Number( ( bytes / 2 ** 20 ).toFixed( 1 ) ) );
	return {
		pageHeapMb: mb( await page.evaluate( () => performance.memory?.usedJSHeapSize ?? null ) ),
		physicsWasmMb: mb( await heapOf( probes["Physics"] ) ),
		scriptsWasmMb: mb( await heapOf( probes["GameLogic"] ) ),
	};
}

/**
 * Gets into the game: once loaded, clicks Play when the start menu asks for it
 * (after a first Play the game may start by itself); done when neither the
 * loading screen nor the menu is up.
 */
async function Play( page ) {
	const layer = ( id ) => page.locator( `.cse-ui-host [data-ui="${ id }"]:not([inert])` );
	const play = page.getByRole( "button", { name: /^(Play|Resume)$/ } );
	const deadline = Date.now() + 120_000;

	while ( Date.now() < deadline ) {
		await page.waitForTimeout( 500 );
		if ( await layer( "EngineLoading" ).count() > 0 ) {
			continue;
		}
		if ( await play.isVisible() ) {
			await play.click( { timeout: 2_000 } ).catch( () => undefined );
			continue;
		}
		if ( await layer( "EnginePauseMenu" ).count() === 0 && await page.locator( ".cse-ui-host" ).count() > 0 ) {
			return;
		}
	}
	throw new Error( "the game did not start (loading screen or menu still up after 120 s)" );
}

/** Opens the scene (with no frame rate limit), gets into the game, then measures. */
async function Measure( page, url, scenario ) {
	const issues = [];
	page.removeAllListeners( "pageerror" );
	page.on( "pageerror", ( error ) => issues.push( error.message ) );
	await page.goto( `${ url }?scene=${ scenario.Scene }&uncapped${ Params ? `&${ Params }` : "" }` );
	await Play( page );
	await scenario.Act?.( page );

	await page.waitForTimeout( Warmup * 1000 );
	const probes = await Probes( page );
	if ( !probes["Render"] ) {
		throw new Error( "the render worker's perf probe is missing" );
	}
	for ( const thread of Object.keys( probes ) ) {
		await Take( probes, thread );
	}
	const windows = [];
	for ( let i = 0; i < Runs; i++ ) {
		await page.waitForTimeout( Seconds * 1000 );
		windows.push( Summarize( await Take( probes, "Render" ), await Take( probes, "GameLogic" ), await Take( probes, "Physics" ) ) );
	}
	const gpu = await probes["Render"].evaluate( () => globalThis.__csePerf.Info() );
	return { result: { ...Combine( windows ), ...( await Memory( page, probes ) ) }, windows, gpu, issues };
}

//#endregion

//#region the report

function Report( machine, browserVersion, gpu, rows, flags ) {
	const mark = ( ok ) => ( ok ? "🟢" : "🔴" );
	const lines = [
		"# Performance report",
		"",
		`Measured ${ new Date().toISOString() } by \`pnpm perf\` (src/CSEngine/Core/Perf/Run.mjs). Target: **${ TargetFps } fps** in every scenario.`,
		"",
		"## The machine",
		"",
		`- CPU: ${ machine.cpu } (${ machine.threads } threads), ${ machine.memoryGb } GB RAM; power: ${ machine.acPower === null ? "?" : machine.acPower ? "AC" : "battery" }`,
		`- GPU: ${ machine.gpu || "?" } - WebGL renderer: ${ gpu?.renderer ?? "?" }`,
		`- Browser: Chromium ${ browserVersion }, ${ Headless ? "headless" : "a window" } of ${ Viewport.width }x${ Viewport.height }, flags: ${ flags.join( " " ) }`,
		`- Method: ${ Warmup } s warm-up, then ${ Runs } windows of ${ Seconds } s; the median window is reported, fps min..max shows the spread.`,
		"",
		"## Results",
		"",
		"fps counts frames that show a new game state; \"draw loop\" is how often the renderer drew (it may draw the same state again).",
		"",
		"| Scenario | fps | min..max | 1% low | 0.1% low | frame p50 / p99, ms | draw loop fps | render CPU p50, ms | logic p50, ms | physics step p50, ms | draws | triangles | vs baseline | target |",
		"|---|---|---|---|---|---|---|---|---|---|---|---|---|---|",
	];
	for ( const { scenario, result, comparison, error } of rows ) {
		if ( error ) {
			lines.push( `| ${ scenario.Id } | - | - | - | - | - | - | - | - | - | - | - | - | 🔴 failed: ${ error.replaceAll( "|", "/" ) } |` );
			continue;
		}
		const change = comparison.change === null ? "new" : `${ comparison.change > 0 ? "+" : "" }${ comparison.change } %${ comparison.regression ? " 🔴 regression" : "" }`;
		lines.push( `| ${ scenario.Id } | **${ result.fps }** | ${ result.fpsMin }..${ result.fpsMax } | ${ result.low1 } | ${ result.low01 } | ${ result.frameP50 } / ${ result.frameP99 } | ${ result.drawFps } | ${ result.renderP50 } | ${ result.logicP50 } | ${ result.physicsP50 } | ${ result.draws } | ${ result.triangles } | ${ change } | ${ mark( result.fps >= TargetFps ) } ${ TargetFps } |` );
	}
	for ( const pending of Pending ) {
		lines.push( `| ${ pending.Id } | - | - | - | - | - | - | - | - | - | - | - | - | 🔴 not measurable yet |` );
	}
	lines.push( "", "## Scenarios", "" );
	for ( const { scenario } of rows ) {
		lines.push( `- **${ scenario.Id }**: ${ scenario.Description }` );
	}
	for ( const pending of Pending ) {
		lines.push( `- **${ pending.Id }** (not measured): ${ pending.Description }` );
	}
	// what was done to get there (kept by hand next to this script)
	const optimizations = join( dirname( fileURLToPath( import.meta.url ) ), "Optimizations.md" );
	if ( existsSync( optimizations ) ) {
		lines.push( "", readFileSync( optimizations, "utf8" ).trim() );
	}
	return `${ lines.join( "\n" ) }\n`;
}

//#endregion

const machine = Machine();
const executablePath = Browser();
const flags = [...UncappedFlags, ...( Headless ? ["--use-angle=gl"] : [] )];
const browser = await chromium.launch( { headless: Headless, args: flags, ...( executablePath ? { executablePath } : {} ) } );
const context = await browser.newContext( { viewport: Viewport, deviceScaleFactor: 1 } );
let page = await context.newPage();
const chosen = Scenarios.filter( ( s ) => Only.length === 0 || Only.includes( s.Id ) );
const baselinePath = join( Output, "baseline.json" );
const baseline = existsSync( baselinePath ) ? JSON.parse( readFileSync( baselinePath, "utf8" ) ) : {};
const rows = [];
let gpu = null;
let port = 4300;

for ( const project of [...new Set( chosen.map( ( s ) => s.Project ) )] ) {
	console.log( `[perf] building ${ project ?? "the Games Sample" }…` );
	const site = await Serve( project, port++ );
	for ( const scenario of chosen.filter( ( s ) => s.Project === project ) ) {
		console.log( `[perf] ${ scenario.Id }…` );
		try {
			const limit = ( Warmup + Runs * Seconds ) * 1000 + 180_000;
			const measured = await Promise.race( [
				Measure( page, site.url, scenario ),
				new Promise( ( _, reject ) => setTimeout( () => reject( new Error( `no result within ${ limit / 1000 } s (the page stopped answering)` ) ), limit ) ),
			] );
			gpu ??= measured.gpu;
			const comparison = Compare( measured.result, baseline[scenario.Id] );
			rows.push( { scenario, ...measured, comparison } );
			console.log( `[perf] ${ scenario.Id }: ${ measured.result.fps } fps (1% low ${ measured.result.low1 }), render ${ measured.result.renderP50 } ms, logic ${ measured.result.logicP50 } ms` );
		}
		catch ( error ) {
			rows.push( { scenario, error: error.message.split( "\n" )[0] } );
			console.error( `[perf] ${ scenario.Id } failed: ${ error.message }` );
			// a page that hung can't run the next scenario
			await page.close( { runBeforeUnload: false } ).catch( () => undefined );
			page = await context.newPage();
		}
	}
	await site.stop();
}
const browserVersion = browser.version();
await browser.close();

mkdirSync( join( Output, "results" ), { recursive: true } );
const stamp = new Date().toISOString().replaceAll( ":", "-" ).replace( /\..*/, "" );
const results = {
	date: new Date().toISOString(), machine, browser: browserVersion, gpu, flags, viewport: Viewport,
	method: { warmupSeconds: Warmup, runs: Runs, seconds: Seconds }, targetFps: TargetFps,
	scenarios: Object.fromEntries( rows.map( ( r ) => [r.scenario.Id, r.error ? { error: r.error } : { ...r.result, windows: r.windows, issues: r.issues }] ) ),
};
writeFileSync( join( Output, "results", `${ stamp }.json` ), `${ JSON.stringify( results, null, "\t" ) }\n` );
writeFileSync( join( Output, "results", "latest.json" ), `${ JSON.stringify( results, null, "\t" ) }\n` );
writeFileSync( join( Output, "REPORT.md" ), Report( machine, browserVersion, gpu, rows, flags ) );
if ( UpdateBaseline || !existsSync( baselinePath ) ) {
	const next = { ...baseline };
	for ( const row of rows.filter( ( r ) => !r.error ) ) {
		next[row.scenario.Id] = { fps: row.result.fps, low1: row.result.low1, date: results.date };
	}
	writeFileSync( baselinePath, `${ JSON.stringify( next, null, "\t" ) }\n` );
}
console.log( `[perf] report: ${ join( Output, "REPORT.md" ) }` );
process.exit( rows.some( ( r ) => r.error || r.comparison?.regression ) ? 1 : 0 );
