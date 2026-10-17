// Created by Anton Piruev in 2026.
// Any direct commercial use of derivative work is strictly prohibited.

using System;

namespace CSEngine.Bridge
{
	/// <summary>
	/// Memory the bridge shares with TypeScript: pinned (it never moves), so TypeScript writes a request straight into
	/// it and the call carries only its length - no array is copied or made on either side. One slot per depth of
	/// nesting each way: TypeScript's calls into C# use the incoming slots, C#'s calls into TypeScript the outgoing ones.
	/// A message larger than a slot takes the byte array way instead.
	/// </summary>
	public sealed class SharedSlots
	{
		public const int SlotSize = 64 * 1024;

		/// <summary>Slots each way: calls nested deeper than this take the byte array way.</summary>
		public const int Depths = 8;

		private readonly byte[] _memory = GC.AllocateArray<byte>( SlotSize * Depths * 2, pinned: true );

		/// <summary>Where the slots start in the runtime's memory (TypeScript sees it in the WebAssembly heap).</summary>
		public unsafe nint Address
		{
			get
			{
				fixed ( byte* start = _memory )
				{
					return (nint)start;
				}
			}
		}

		/// <summary>The slot of a call from TypeScript at this depth (request in, answer out).</summary>
		public Span<byte> Incoming( int depth ) => _memory.AsSpan( depth * SlotSize, SlotSize );

		/// <summary>The slot of a call to TypeScript at this depth (request out, answer in).</summary>
		public Span<byte> Outgoing( int depth ) => _memory.AsSpan( ( Depths + depth ) * SlotSize, SlotSize );
	}
}