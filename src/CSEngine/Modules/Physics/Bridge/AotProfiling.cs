// Created by Anton Piruev in 2026.
// Any direct commercial use of derivative work is strictly prohibited.

#if CSE_AOT_PROFILE

using System.Diagnostics.CodeAnalysis;
using System.Runtime.InteropServices;
using System.Runtime.InteropServices.JavaScript;
using System.Runtime.Versioning;

namespace Physics.Wasm
{
	/// <summary>
	/// Hooks for recording an AOT profile (only compiled into the profiling build, see Profiling/README.md).
	/// The Mono AOT profiler is configured from JS with writeAt = StopAotProfile and sendTo = ReceiveAotProfile:
	/// calling StopAotProfile makes the runtime serialize every method it has executed and hand the bytes to
	/// ReceiveAotProfile, from where GetAotProfile returns them to JS.
	/// </summary>
	public static partial class PhysicsBridge
	{
		private static byte[]? _aotProfile;

		/// <summary>Profiler trigger: the body is empty, the runtime dumps the profile when this method runs.</summary>
		[SupportedOSPlatform( "browser" )]
		[JSExport]
		[DynamicDependency( nameof( ReceiveAotProfile ) )]
		public static void StopAotProfile()
		{
		}

		/// <summary>The profiler's send-to target. Its signature is fixed by the runtime: void (ref byte, int, string).</summary>
		private static void ReceiveAotProfile( ref byte data, int length, string extraArgument ) =>
			_aotProfile = MemoryMarshal.CreateReadOnlySpan( ref data, length ).ToArray();

		/// <summary>The profile captured by <see cref="StopAotProfile"/>, or an empty array if it hasn't run yet.</summary>
		[SupportedOSPlatform( "browser" )]
		[JSExport]
		[return: JSMarshalAs<JSType.Array<JSType.Number>>]
		public static byte[] GetAotProfile() => _aotProfile ?? [];
	}
}

#endif