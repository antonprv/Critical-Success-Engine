// Created by Anton Piruev in 2026.
// Any direct commercial use of derivative work is strictly prohibited.

import type { spawn } from "node:child_process";
import { EventEmitter } from "node:events";
import { existsSync, mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { createServer, request, type Server } from "node:http";
import { createServer as createSocketServer, type Server as SocketServer } from "node:net";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { BuildDirectory, IsProgram, PnpmCommand, ProjectRunner, ServeDirectory, WriteElectronShell } from "../Source/Main/ProjectRunner";

let sandbox = "";
const servers: { close(): void; }[] = [];

beforeEach( () => {
	sandbox = mkdtempSync( join( tmpdir(), "cse-runner-" ) );
} );

afterEach( () => {
	for ( const server of servers.splice( 0 ) ) {
		server.close();
	}
	rmSync( sandbox, { recursive: true, force: true } );
} );

/** A project file, with the builds named by `builds` ("Web/Dev"...); a Desktop build gets its Electron shell too. */
function Project( ...builds: string[] ): string {
	const file = join( sandbox, "Moon", "Moon.cseproject" );
	mkdirSync( join( sandbox, "Moon" ), { recursive: true } );
	writeFileSync( file, "{}" );
	for ( const build of builds ) {
		const directory = join( sandbox, "Moon", "Binaries", build );
		mkdirSync( directory, { recursive: true } );
		writeFileSync( join( directory, "index.html" ), "<p>moon</p>" );
		if ( build.startsWith( "Desktop" ) ) {
			writeFileSync( join( directory, "electron-main.cjs" ), "" );
		}
	}
	return file;
}

/** What a spawned process looks like to the runner. */
class FakeChild extends EventEmitter {
	public exitCode: number | null = null;

	public readonly stdout: EventEmitter | null = new EventEmitter();

	public readonly stderr: EventEmitter | null = new EventEmitter();

	public readonly kill = vi.fn( () => {
		this.Exit( null );
		return true;
	} );

	public readonly unref = vi.fn();

	public Exit( code: number | null ): void {
		this.exitCode = code ?? 0;
		this.emit( "exit", code );
	}
}

type SpawnCall = { command: string; args: string[]; options: { cwd?: string; env?: Record<string, string | undefined>; shell?: boolean; detached?: boolean; }; };

/** A spawner that records its calls and lets `behave` play the process. */
function Spawner( behave: ( call: SpawnCall, child: FakeChild ) => void = () => undefined ) {
	const calls: SpawnCall[] = [];
	const children: FakeChild[] = [];
	const fake = ( command: string, args: string[], options: SpawnCall["options"] ) => {
		const child = new FakeChild();
		const call = { command, args, options };
		calls.push( call );
		children.push( child );
		behave( call, child );
		return child;
	};
	return { Spawn: fake as unknown as typeof spawn, calls, children };
}

/** GET a URL; resolves with the status, the content type and the body. */
function Fetch( url: string, path: string ): Promise<{ status: number; type: string | undefined; body: string; }> {
	return new Promise( ( done, fail ) => {
		const target = new URL( url );
		const call = request( { host: target.hostname, port: target.port, path, method: "GET" }, ( response ) => {
			let body = "";
			response.on( "data", ( chunk: Buffer ) => {
				body += chunk.toString();
			} );
			response.on( "end", () => done( { status: response.statusCode!, type: response.headers["content-type"], body } ) );
		} );
		call.on( "error", fail );
		call.end();
	} );
}

/** The dev server a fake `pnpm exec vite --port N` starts: a real one on that port. */
function ServeOnPort( args: string[] ): Server {
	const server = createServer( ( _request, response ) => response.end( "dev" ) );
	server.listen( Number( args[args.indexOf( "--port" ) + 1] ), "127.0.0.1" );
	servers.push( server );
	return server;
}

describe( "hosting a built site", () => {
	it( "builds go to Binaries/<platform>/<configuration> next to the project", () => {
		expect( BuildDirectory( "/games/Moon/Moon.cseproject", "Desktop", "Prod" ) ).toBe( join( "/games/Moon", "Binaries", "Desktop", "Prod" ) );
	} );

	it( "serves the folder: index.html for a folder, content types by extension, 404 for what is missing, 403 outside it", async () => {
		const root = join( sandbox, "site" );
		mkdirSync( root );
		writeFileSync( join( root, "index.html" ), "<h1>hi</h1>" );
		writeFileSync( join( root, "game.wasm" ), "wasm" );
		writeFileSync( join( root, "blob.xyz" ), "?" );
		writeFileSync( join( sandbox, "secret.txt" ), "no" );
		const { Url, Server } = await ServeDirectory( root );
		servers.push( Server );
		expect( Url ).toMatch( /^http:\/\/127\.0\.0\.1:\d+\/$/ );
		expect( await Fetch( Url, "/?from=menu" ) ).toEqual( { status: 200, type: "text/html; charset=utf-8", body: "<h1>hi</h1>" } );
		expect( ( await Fetch( Url, "/game.wasm" ) ).type ).toBe( "application/wasm" );
		expect( ( await Fetch( Url, "/blob.xyz" ) ).type ).toBe( "application/octet-stream" );
		expect( ( await Fetch( Url, "/nothing.js" ) ).status ).toBe( 404 );
		expect( ( await Fetch( Url, "/%2e%2e/secret.txt" ) ).status ).toBe( 403 );
	} );

	it( "a Desktop build gets an Electron shell: its main script and the package.json naming it", () => {
		const directory = join( sandbox, "out" );
		WriteElectronShell( directory, "MoonRise" );
		expect( JSON.parse( readFileSync( join( directory, "package.json" ), "utf8" ) ) ).toEqual( { name: "moonrise", version: "1.0.0", main: "electron-main.cjs" } );
		expect( readFileSync( join( directory, "electron-main.cjs" ), "utf8" ) ).toContain( "new BrowserWindow" );
	} );
} );

describe( "ProjectRunner: what can run", () => {
	it( "dev needs the project; a build mode needs its build (a Desktop one with its Electron shell)", () => {
		const runner = new ProjectRunner( { CoreDirectory: "/core", Open: vi.fn() } );
		expect( runner.Availability( join( sandbox, "Nope.cseproject" ) ) ).toEqual( { "dev": false, "web:dev": false, "web:prod": false, "desktop:dev": false, "desktop:prod": false } );
		const file = Project( "Web/Prod", "Desktop/Dev" );
		mkdirSync( join( sandbox, "Moon", "Binaries", "Desktop", "Prod" ), { recursive: true } );
		writeFileSync( join( sandbox, "Moon", "Binaries", "Desktop", "Prod", "index.html" ), "" );
		expect( runner.Availability( file ) ).toEqual( { "dev": true, "web:dev": false, "web:prod": true, "desktop:dev": true, "desktop:prod": false } );
	} );
} );

describe( "ProjectRunner: running", () => {
	it( "a Web build is hosted once and opened in the browser; a missing build says to build first", async () => {
		const open = vi.fn();
		const runner = new ProjectRunner( { CoreDirectory: "/core", Open: open } );
		const file = Project( "Web/Dev" );
		await expect( runner.Run( file, "web:prod" ) ).rejects.toThrow( "There is no Web Prod build in" );
		await runner.Run( file, "web:dev" );
		await runner.Run( file, "web:dev" );
		expect( open ).toHaveBeenCalledTimes( 2 );
		expect( open.mock.calls[0]![0] ).toBe( open.mock.calls[1]![0] );
		expect( ( await Fetch( open.mock.calls[0]![0] as string, "/" ) ).body ).toBe( "<p>moon</p>" );
		runner.Dispose();
	} );

	it( "a Desktop build opens in its own Electron process, left to run on its own", async () => {
		const { Spawn, calls, children } = Spawner();
		const file = Project( "Desktop/Prod" );
		await new ProjectRunner( { CoreDirectory: "/core", Open: vi.fn(), ElectronPath: "/bin/electron", Spawn } ).Run( file, "desktop:prod" );
		const directory = join( sandbox, "Moon", "Binaries", "Desktop", "Prod" );
		expect( calls[0] ).toMatchObject( { command: "/bin/electron", args: [ directory ], options: { cwd: directory, detached: true } } );
		expect( calls[0]!.options.env!["ELECTRON_RUN_AS_NODE"] ).toBeUndefined();
		expect( children[0]!.unref ).toHaveBeenCalled();
		// a failure to start is the window not appearing, not a crash of the app
		expect( () => children[0]!.emit( "error", new Error( "no electron" ) ) ).not.toThrow();
		await new ProjectRunner( { CoreDirectory: "/core", Open: vi.fn(), Spawn } ).Run( file, "desktop:prod" );
		expect( calls[1]!.command ).toBe( process.execPath );
	} );

	it( "dev starts the Core's dev server for the project once, and opens it when it answers", async () => {
		const open = vi.fn();
		const { Spawn, calls, children } = Spawner( ( call ) => ServeOnPort( call.args ) );
		const file = Project();
		const runner = new ProjectRunner( { CoreDirectory: "/core", Open: open, Spawn } );
		await runner.Run( file, "dev" );
		await runner.Run( file, "dev" );
		expect( calls ).toHaveLength( 1 );
		expect( calls[0] ).toMatchObject( { args: [ "exec", "vite", "--host", "127.0.0.1", "--port", expect.any( String ) ], options: { cwd: "/core" } } );
		expect( calls[0]!.options.env!["CSE_PROJECT"] ).toBe( file );
		expect( open ).toHaveBeenCalledWith( `http://127.0.0.1:${ calls[0]!.args[5] }/` );
		// once it has stopped, the next run starts it again
		children[0]!.Exit( 0 );
		await runner.Run( file, "dev" );
		expect( calls ).toHaveLength( 2 );
		runner.Dispose();
		expect( children[1]!.kill ).toHaveBeenCalled();
	} );

	it( "a dev server that fails to start or exits says so; one that never answers is stopped", async () => {
		const file = Project();
		const failing = Spawner( ( _call, child ) => queueMicrotask( () => child.emit( "error", new Error( "pnpm not found" ) ) ) );
		await expect( new ProjectRunner( { CoreDirectory: "/core", Open: vi.fn(), Spawn: failing.Spawn, DevPollMs: 5 } ).Run( file, "dev" ) )
			.rejects.toThrow( "The dev server did not start: pnpm not found" );
		const exiting = Spawner( ( _call, child ) => queueMicrotask( () => child.Exit( 1 ) ) );
		await expect( new ProjectRunner( { CoreDirectory: "/core", Open: vi.fn(), Spawn: exiting.Spawn, DevPollMs: 5 } ).Run( file, "dev" ) )
			.rejects.toThrow( "The dev server did not start: the dev server exited with code 1" );
		const silent = Spawner();
		await expect( new ProjectRunner( { CoreDirectory: "/core", Open: vi.fn(), Spawn: silent.Spawn, DevPollMs: 5, DevPollAttempts: 2 } ).Run( file, "dev" ) )
			.rejects.toThrow( "The dev server did not answer in 0.01 seconds" );
		expect( silent.children[0]!.kill ).toHaveBeenCalled();
	} );

	it( "a server that takes the connection but never answers counts as not up (after a second)", async () => {
		const file = Project();
		const sockets: SocketServer[] = [];
		const mute = Spawner( ( call ) => {
			const server = createSocketServer( () => undefined );
			server.listen( Number( call.args[5] ), "127.0.0.1" );
			sockets.push( server );
			servers.push( server );
		} );
		await expect( new ProjectRunner( { CoreDirectory: "/core", Open: vi.fn(), Spawn: mute.Spawn, DevPollMs: 1, DevPollAttempts: 1 } ).Run( file, "dev" ) )
			.rejects.toThrow( "did not answer" );
		expect( sockets ).toHaveLength( 1 );
	}, 5000 );
} );

describe( "ProjectRunner: building", () => {
	/** A fake `pnpm exec vite build` that writes the site into CSE_OUT_DIR and exits with `code`. */
	const Builder = ( code = 0, site = true ) => Spawner( ( call, child ) => {
		queueMicrotask( () => {
			const out = call.options.env!["CSE_OUT_DIR"]!;
			if ( site ) {
				mkdirSync( out, { recursive: true } );
				writeFileSync( join( out, "index.html" ), "" );
			}
			child.stdout?.emit( "data", Buffer.from( "vite v8 building\n" ) );
			child.stderr?.emit( "data", Buffer.from( "error: something broke\n" ) );
			child.Exit( code );
		} );
	} );

	it( "builds with the Core's Vite into the project's Binaries; Dev in development mode; Desktop adds the Electron shell", async () => {
		const file = Project();
		const builder = Builder();
		const packaged = vi.fn( async ( options: { Output: string; Name: string; } ) => join( options.Output, `${ options.Name }.exe` ) );
		const runner = new ProjectRunner( { CoreDirectory: "/core", Open: vi.fn(), Spawn: builder.Spawn, Package: packaged, Platform: "win32" } );
		const web = await runner.Build( file, "Web", "Prod" );
		expect( web.Directory ).toBe( join( sandbox, "Moon", "Binaries", "Web", "Prod" ) );
		expect( builder.calls[0] ).toMatchObject( { args: [ "exec", "vite", "build" ], options: { cwd: "/core" } } );
		expect( builder.calls[0]!.options.env ).toMatchObject( { CSE_PROJECT: file, CSE_OUT_DIR: web.Directory } );
		expect( existsSync( join( web.Directory, "electron-main.cjs" ) ) ).toBe( false );
		const desktop = await runner.Build( file, "Desktop", "Dev" );
		expect( builder.calls[1]!.args ).toEqual( [ "exec", "vite", "build", "--mode", "development" ] );
		expect( existsSync( join( desktop.Directory, "electron-main.cjs" ) ) ).toBe( true );
		// On Windows the Desktop build is packaged into Binaries/Windows/<configuration>/<Name>.exe.
		expect( desktop.Executable ).toBe( join( sandbox, "Moon", "Binaries", "Windows", "Dev", "Moon.exe" ) );
		expect( packaged ).toHaveBeenCalledWith( { App: desktop.Directory, Output: join( sandbox, "Moon", "Binaries", "Windows", "Dev" ), Name: "Moon", Id: "com.criticalsuccess.moon" } );
		expect( web.Executable ).toBeUndefined();
		// Elsewhere only the shell (Linux and macOS packages come later).
		const linux = await new ProjectRunner( { CoreDirectory: "/core", Open: vi.fn(), Spawn: Builder().Spawn, Package: packaged, Platform: "linux" } ).Build( file, "Desktop", "Prod" );
		expect( linux.Executable ).toBeUndefined();
		expect( packaged ).toHaveBeenCalledTimes( 1 );
	} );

	it( "a failed build reports the end of its output; pnpm that won't start, or a build without a page, are errors too", async () => {
		const file = Project();
		await expect( new ProjectRunner( { CoreDirectory: "/core", Open: vi.fn(), Spawn: Builder( 2 ).Spawn } ).Build( file, "Web", "Dev" ) )
			.rejects.toThrow( "The build failed (exit code 2):\nvite v8 building\nerror: something broke" );
		const missing = Spawner( ( _call, child ) => queueMicrotask( () => child.emit( "error", new Error( "ENOENT" ) ) ) );
		await expect( new ProjectRunner( { CoreDirectory: "/core", Open: vi.fn(), Spawn: missing.Spawn } ).Build( file, "Web", "Dev" ) )
			.rejects.toThrow( "Could not start pnpm: ENOENT" );
		await expect( new ProjectRunner( { CoreDirectory: "/core", Open: vi.fn(), Spawn: Builder( 0, false ).Spawn } ).Build( file, "Web", "Prod" ) )
			.rejects.toThrow( "has no index.html" );
	} );

	it( "a process without output streams is fine", async () => {
		const file = Project();
		const quiet = Spawner( ( call, child ) => {
			( child as { stdout: unknown; } ).stdout = null;
			( child as { stderr: unknown; } ).stderr = null;
			queueMicrotask( () => {
				mkdirSync( call.options.env!["CSE_OUT_DIR"]!, { recursive: true } );
				writeFileSync( join( call.options.env!["CSE_OUT_DIR"]!, "index.html" ), "" );
				child.Exit( 0 );
			} );
		} );
		await expect( new ProjectRunner( { CoreDirectory: "/core", Open: vi.fn(), Spawn: quiet.Spawn } ).Build( file, "Web", "Dev" ) ).resolves.toBeDefined();
	} );

	it( "on Windows pnpm is pnpm.cmd, run through the shell", async () => {
		const platform = Object.getOwnPropertyDescriptor( process, "platform" )!;
		Object.defineProperty( process, "platform", { value: "win32" } );
		try {
			vi.resetModules();
			const { ProjectRunner: WindowsRunner } = await import( "../Source/Main/ProjectRunner" );
			const builder = Builder();
			await new WindowsRunner( { CoreDirectory: "/core", Open: vi.fn(), Spawn: builder.Spawn } ).Build( Project(), "Web", "Dev" );
			expect( builder.calls[0] ).toMatchObject( { command: "pnpm.cmd", options: { shell: true } } );
		} finally {
			Object.defineProperty( process, "platform", platform );
		}
	} );
} );

describe( "pnpm", () => {
	it( "is pnpm.cmd on Windows and pnpm elsewhere", () => {
		expect( PnpmCommand( "win32" ) ).toBe( "pnpm.cmd" );
		expect( PnpmCommand( "linux" ) ).toBe( "pnpm" );
	} );
} );

describe( "programs (S6-14)", () => {
	/** A program's project: Kind Program in its .cseproject. */
	function Program(): string {
		const file = join( sandbox, "Hello", "Hello.cseproject" );
		mkdirSync( join( sandbox, "Hello" ), { recursive: true } );
		writeFileSync( file, JSON.stringify( { Name: "Hello", Kind: "Program" } ) );
		return file;
	}

	/** Plays the three passes of the program build: the page (index.html), main.cjs, preload.cjs. */
	const ProgramBuilder = () => Spawner( ( call, child ) => {
		queueMicrotask( () => {
			const out = call.options.env?.["CSE_OUT_DIR"];
			// Electron itself (the dev window): nothing to play.
			if ( out === undefined || call.options.env?.["CSE_PROGRAM_URL"] ) return;
			mkdirSync( out, { recursive: true } );
			const mode = call.args.includes( "--mode" ) ? call.args[call.args.indexOf( "--mode" ) + 1] : "page";
			if ( call.args.includes( "build" ) ) writeFileSync( join( out, mode === "page" ? "index.html" : `${ mode! }.cjs` ), "" );
			else ServeOnPort( call.args );
			if ( call.args.includes( "build" ) ) child.Exit( 0 );
		} );
	} );

	it( "are told by their Kind", () => {
		expect( IsProgram( Program() ) ).toBe( true );
		expect( IsProgram( Project() ) ).toBe( false );
		expect( IsProgram( join( sandbox, "missing.cseproject" ) ) ).toBe( false );
	} );

	it( "build for the desktop only, with @cse/program's Vite in three passes, into an .exe on Windows", async () => {
		const file = Program();
		const builder = ProgramBuilder();
		const packaged = vi.fn( async () => "C:/Hello.exe" );
		const runner = new ProjectRunner( { CoreDirectory: "/core", Open: vi.fn(), Spawn: builder.Spawn, Package: packaged, Platform: "win32" } );
		await expect( runner.Build( file, "Web", "Prod" ) ).rejects.toThrow( /desktop only/ );
		expect( runner.Availability( file )["desktop:prod"] ).toBe( false );
		const built = await runner.Build( file, "Desktop", "Prod" );
		const config = [ "--configLoader", "runner", "--config", "Build/vite.program.config.ts" ];
		expect( builder.calls.map( ( c ) => c.args ) ).toEqual( [
			[ "exec", "vite", "build", ...config ],
			[ "exec", "vite", "build", ...config, "--mode", "main" ],
			[ "exec", "vite", "build", ...config, "--mode", "preload" ],
		] );
		expect( builder.calls[0]!.options.cwd ).toBe( join( "/core", "../Modules/Engine/Program" ) );
		expect( builder.calls[0]!.options.env ).toMatchObject( { CSE_PROJECT: file, CSE_OUT_DIR: built.Directory, CSE_CONFIGURATION: "Prod" } );
		expect( existsSync( join( built.Directory, "electron-main.cjs" ) ) ).toBe( false );
		expect( built.Executable ).toBe( "C:/Hello.exe" );
		expect( runner.Availability( file ) ).toEqual( { "dev": true, "web:dev": false, "web:prod": false, "desktop:dev": false, "desktop:prod": true } );
		// A folder of its own for @cse/program when the tools say so.
		const own = ProgramBuilder();
		await new ProjectRunner( { CoreDirectory: "/core", ProgramDirectory: "/program", Open: vi.fn(), Spawn: own.Spawn, Package: packaged, Platform: "linux" } ).Build( file, "Desktop", "Dev" );
		expect( own.calls[0]!.options.cwd ).toBe( "/program" );
	} );

	it( "run in development in their own Electron window on the dev server's page", async () => {
		const file = Program();
		const builder = ProgramBuilder();
		const open = vi.fn();
		const runner = new ProjectRunner( { CoreDirectory: "/core", Open: open, Spawn: builder.Spawn, ElectronPath: "/bin/electron", DevPollMs: 5 } );
		await runner.Run( file, "dev" );
		const shell = join( sandbox, "Hello", "Binaries", "Desktop", "DevShell" );
		expect( builder.calls[0]!.args.slice( 0, 6 ) ).toEqual( [ "exec", "vite", "--configLoader", "runner", "--config", "Build/vite.program.config.ts" ] );
		expect( builder.calls[0]!.options.env ).toMatchObject( { CSE_PROJECT: file, CSE_OUT_DIR: shell, CSE_CONFIGURATION: "Dev" } );
		expect( builder.calls.slice( 1, 3 ).map( ( c ) => c.args.at( -1 ) ) ).toEqual( [ "main", "preload" ] );
		expect( JSON.parse( readFileSync( join( shell, "package.json" ), "utf8" ) ) ).toEqual( { name: "hello", productName: "Hello", version: "1.0.0", main: "main.cjs" } );
		const electron = builder.calls[3]!;
		expect( electron.command ).toBe( "/bin/electron" );
		expect( electron.args ).toEqual( [ shell ] );
		expect( electron.options.env!["CSE_PROGRAM_URL"] ).toMatch( /^http:\/\/127\.0\.0\.1:\d+\/$/ );
		expect( open ).not.toHaveBeenCalled();
		runner.Dispose();
		// The tools' own Electron by default; a window that fails to start is not the tools' failure.
		const fresh = ProgramBuilder();
		const plain = new ProjectRunner( { CoreDirectory: "/core", Open: open, Spawn: fresh.Spawn, DevPollMs: 5 } );
		await plain.Run( Program(), "dev" );
		expect( fresh.calls[3]!.command ).toBe( process.execPath );
		fresh.children[3]!.emit( "error", new Error( "no electron" ) );
		plain.Dispose();
	} );
} );
