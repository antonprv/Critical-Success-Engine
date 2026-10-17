// Created by Anton Piruev in 2026.
// Any direct commercial use of derivative work is strictly prohibited.
//
// The wasm SDK wants a main script for the AppBundle. The engine doesn't use it: its game logic worker loads
// _framework/dotnet.js and calls CSEngine.Browser.ScriptExports (Core/Source/Engine/Scripting/CSharpScripts.ts).

import { dotnet } from "./_framework/dotnet.js";

const runtime = await dotnet.create();
const exports = await runtime.getAssemblyExports( "CSEngine.Scripting" );
globalThis.CseScripts = exports.CSEngine.Browser.ScriptExports;
console.log( "C# scripts loaded:", globalThis.CseScripts.Start( runtime.getConfig().mainAssemblyName ) );
