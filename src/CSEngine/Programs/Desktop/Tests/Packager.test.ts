// Created by Anton Piruev in 2026.
// Any direct commercial use of derivative work is strictly prohibited.

import { existsSync, mkdirSync, mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { BuilderConfig, ElectronVersion, PackageApp, type Builder } from "../Source/Main/Packager";

let sandbox = "";
let app = "";
beforeEach( () => {
	sandbox = mkdtempSync( join( tmpdir(), "cse-package-" ) );
	app = join( sandbox, "App" );
	mkdirSync( app );
	writeFileSync( join( app, "package.json" ), JSON.stringify( { name: "moon", main: "electron-main.cjs" } ) );
} );
afterEach( () => rmSync( sandbox, { recursive: true, force: true } ) );

/** Stands in for electron-builder: makes what it would (the .exe, its working folders) and says what it made. */
function FakeBuilder( made: ( output: string ) => string[] = ( output ) => [ join( output, "Moon.exe" ) ] ) {
	const calls: Parameters<Builder>[0][] = [];
	const builder: Builder = async ( options ) => {
		calls.push( options );
		const output = ( options.config["directories"] as { output: string; } ).output;
		mkdirSync( join( output, "win-unpacked" ), { recursive: true } );
		writeFileSync( join( output, "builder-debug.yml" ), "" );
		writeFileSync( join( output, "builder-effective-config.yaml" ), "" );
		const artifacts = made( output );
		for ( const artifact of artifacts ) writeFileSync( artifact, "" );
		return artifacts;
	};
	return { builder, calls };
}

describe( "PackageApp: a program as a Windows executable", () => {
	it( "packages the folder with the tools' Electron, leaving only the executable in the output", async () => {
		const output = join( sandbox, "Binaries", "Windows", "Prod" );
		const { builder, calls } = FakeBuilder();
		const exe = await PackageApp( { App: app, Output: output, Name: "Moon", Id: "com.criticalsuccess.moon" }, builder );
		expect( exe ).toBe( join( output, "Moon.exe" ) );
		expect( calls[0]!.projectDir ).toBe( app );
		expect( calls[0]!.win ).toEqual( [ "portable" ] );
		expect( existsSync( join( output, "win-unpacked" ) ) ).toBe( false );
		expect( existsSync( join( output, "builder-debug.yml" ) ) ).toBe( false );
		expect( existsSync( join( output, "builder-effective-config.yaml" ) ) ).toBe( false );
	} );

	it( "can make a folder instead, and says when there is nothing to package or no executable came out", async () => {
		const output = join( sandbox, "Out" );
		expect( await PackageApp( { App: app, Output: output, Name: "Moon", Id: "x", Target: "dir" }, FakeBuilder().builder ) ).toBe( join( output, "win-unpacked", "Moon.exe" ) );
		await expect( PackageApp( { App: sandbox, Output: output, Name: "Moon", Id: "x" }, FakeBuilder().builder ) ).rejects.toThrow( /has no package.json/ );
		await expect( PackageApp( { App: app, Output: output, Name: "Moon", Id: "x" }, FakeBuilder( () => [] ).builder ) ).rejects.toThrow( "made no .exe (it made: nothing)" );
		await expect( PackageApp( { App: app, Output: output, Name: "Moon", Id: "x" }, FakeBuilder( ( o ) => [ join( o, "a.blockmap" ) ] ).builder ) ).rejects.toThrow( /it made: .*a\.blockmap/ );
	} );

	it( "configures electron-builder: the tools' Electron, two locales, a named portable exe, icon and file types when given", () => {
		const plain = BuilderConfig( { App: app, Output: "/out", Name: "Moon", Id: "com.criticalsuccess.moon" } );
		expect( plain ).toMatchObject( {
			appId: "com.criticalsuccess.moon", productName: "Moon", electronVersion: ElectronVersion(), directories: { output: "/out" },
			npmRebuild: false, asar: true, electronLanguages: [ "en-US", "ru" ], extraMetadata: { version: "1.0.0" }, portable: { artifactName: "${productName}.exe" },
		} );
		expect( plain["fileAssociations"] ).toBeUndefined();
		expect( plain["win"] ).toEqual( { signAndEditExecutable: true } );
		const full = BuilderConfig( { App: app, Output: "/out", Name: "Tables", Id: "x", Version: "2.1.0", Icon: "/icon.ico", FileTypes: [ { Extension: "cstables", Name: "CSTables", Description: "CSTables table" } ] } );
		expect( full["win"] ).toEqual( { icon: "/icon.ico", signAndEditExecutable: true } );
		expect( full["extraMetadata"] ).toEqual( { version: "2.1.0" } );
		expect( full["fileAssociations"] ).toEqual( [ { ext: "cstables", name: "CSTables", description: "CSTables table" } ] );
		expect( ElectronVersion() ).toMatch( /^\d+\.\d+\.\d+/ );
	} );
} );

describe( "electron-builder", () => {
	it( "is imported only when packaging, and given the options as they are", async () => {
		vi.resetModules();
		const build = vi.fn( async () => [ join( sandbox, "Out", "Moon.exe" ) ] );
		vi.doMock( "electron-builder", () => ( { build } ) );
		const { PackageApp: Package } = await import( "../Source/Main/Packager" );
		expect( await Package( { App: app, Output: join( sandbox, "Out" ), Name: "Moon", Id: "x" } ) ).toBe( join( sandbox, "Out", "Moon.exe" ) );
		expect( build ).toHaveBeenCalledWith( expect.objectContaining( { projectDir: app, win: [ "portable" ] } ) );
		vi.doUnmock( "electron-builder" );
	} );
} );

describe( "the project runner's packaging by default", () => {
	it( "uses PackageApp (electron-builder) when nothing else is given", async () => {
		vi.resetModules();
		const packageApp = vi.fn( async () => "/out/Moon.exe" );
		vi.doMock( "../Source/Main/Packager", () => ( { PackageApp: packageApp } ) );
		const { ProjectRunner } = await import( "../Source/Main/ProjectRunner" );
		const file = join( sandbox, "Moon", "Moon.cseproject" );
		mkdirSync( join( sandbox, "Moon" ) );
		writeFileSync( file, "{}" );
		const spawn = vi.fn( ( _command: string, _args: string[], options: { env: Record<string, string>; } ) => {
			const out = options.env["CSE_OUT_DIR"]!;
			mkdirSync( out, { recursive: true } );
			writeFileSync( join( out, "index.html" ), "" );
			const handlers = new Map<string, ( code: number ) => void>();
			queueMicrotask( () => handlers.get( "exit" )!( 0 ) );
			return { stdout: null, stderr: null, once: ( event: string, handler: ( code: number ) => void ) => handlers.set( event, handler ) };
		} );
		const runner = new ProjectRunner( { CoreDirectory: "/core", Open: vi.fn(), Spawn: spawn as never } );
		const result = await runner.Build( file, "Desktop", "Prod" );
		expect( result.Executable === "/out/Moon.exe" || process.platform !== "win32" ).toBe( true );
		expect( packageApp ).toHaveBeenCalledTimes( process.platform === "win32" ? 1 : 0 );
		vi.doUnmock( "../Source/Main/Packager" );
	} );
} );
