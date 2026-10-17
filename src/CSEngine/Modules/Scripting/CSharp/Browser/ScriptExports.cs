// Created by Anton Piruev in 2026.
// Any direct commercial use of derivative work is strictly prohibited.

using CSEngine.Bridge;
using System;
using System.Diagnostics.CodeAnalysis;
using System.Reflection;
using System.Runtime.InteropServices.JavaScript;
using System.Runtime.Versioning;

namespace CSEngine.Browser
{
	/// <summary>
	/// What the TypeScript runtime calls (Core/Source/Engine/Scripting/CSharpScripts.ts): start the host on the game's
	/// assembly, then one <see cref="Run"/> per phase.
	/// </summary>
	[SupportedOSPlatform( "browser" )]
	public static partial class ScriptExports
	{
		private static ScriptHost? _host;

		/// <summary>Starts the host with the components of <paramref name="assemblyName"/>; returns their names (comma-separated).</summary>
		[JSExport]
		[UnconditionalSuppressMessage( "Trimming", "IL2026", Justification = "The game assembly is rooted (Sdk/CSEngine.Game.targets)." )]
		public static string Start( string assemblyName )
		{
			_host = new ScriptHost();
			_host.Bridge.Send = CallTypeScript;
			_host.Bridge.SendSlot = CallTypeScriptSlot;
			_host.Bridge.TakeTypeScriptOverflow = TakeTypeScriptOverflow;
			_host.Registry.Register( Assembly.Load( assemblyName ) );
			return string.Join( ",", _host.Registry.Names );
		}

		/// <summary>One phase: commands in, results out (both MessagePack, see Protocol.cs).</summary>
		[JSExport]
		public static byte[] Run( byte[] commands ) => Host.Run( commands );

		/// <summary>TypeScript calling a contract implemented in C# (see Bridge/Contracts.cs).</summary>
		[JSExport]
		public static byte[] Call( byte[] request ) => Host.Call( request );

		/// <summary>C# calling a contract implemented in TypeScript: the runtime's "cse-bridge" module answers.</summary>
		[JSImport( "Call", "cse-bridge" )]
		private static partial byte[] CallTypeScript( byte[] request );

		// The shared slots (Bridge/SharedSlots.cs): a call carries only where and how long its message is.

		/// <summary>Where the shared slots are in the WebAssembly memory.</summary>
		[JSExport]
		public static int SlotsAddress() => (int)Host.Bridge.Slots.Address;

		[JSExport]
		public static int SlotSize() => SharedSlots.SlotSize;

		[JSExport]
		public static int SlotDepths() => SharedSlots.Depths;

		/// <summary>TypeScript calling C# with its request in an incoming slot; the answer's length (-1: TakeOverflow).</summary>
		[JSExport]
		public static int CallSlot( int depth, int length ) => Host.Bridge.ServeSlot( depth, length );

		[JSExport]
		public static byte[] TakeOverflow() => Host.Bridge.TakeOverflow();

		/// <summary>C# calling TypeScript with its request in an outgoing slot; the answer's length (-1: TakeOverflow).</summary>
		[JSImport( "CallSlot", "cse-bridge" )]
		private static partial int CallTypeScriptSlot( int depth, int length );

		[JSImport( "TakeOverflow", "cse-bridge" )]
		private static partial byte[] TakeTypeScriptOverflow();

		private static ScriptHost Host => _host ?? throw new InvalidOperationException( "ScriptExports.Start was not called" );
	}
}