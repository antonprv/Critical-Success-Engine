// Created by Anton Piruev in 2026.
// Any direct commercial use of derivative work is strictly prohibited.

using System.Numerics;
using System.Runtime.CompilerServices;

namespace FastMath
{
	/// <summary>
	/// The wide (Vector&lt;T&gt;) math of the physics. The main build has SIMD and these are Vector's own intrinsics. The
	/// build for hosts without WebAssembly SIMD (CSE_NO_SIMD) can't run them as instructions, and .NET's software
	/// fallback for them is generic per-element code; there they are <see cref="Lanes"/>: FastMath per lane.
	/// </summary>
	public static class FMathWide
	{
#if CSE_NO_SIMD
		/// <summary>Whether this build runs the wide math as SIMD instructions.</summary>
		public static bool UsesSimd => false;

		[MethodImpl( MethodImplOptions.AggressiveInlining )]
		public static Vector<float> Max( Vector<float> a, Vector<float> b ) => Lanes.Max( a, b );

		[MethodImpl( MethodImplOptions.AggressiveInlining )]
		public static Vector<float> Min( Vector<float> a, Vector<float> b ) => Lanes.Min( a, b );

		[MethodImpl( MethodImplOptions.AggressiveInlining )]
		public static Vector<float> Abs( Vector<float> v ) => Lanes.Abs( v );

		[MethodImpl( MethodImplOptions.AggressiveInlining )]
		public static Vector<float> Floor( Vector<float> v ) => Lanes.Floor( v );

		[MethodImpl( MethodImplOptions.AggressiveInlining )]
		public static Vector<float> Sqrt( Vector<float> v ) => Lanes.Sqrt( v );

		[MethodImpl( MethodImplOptions.AggressiveInlining )]
		public static Vector<float> Reciprocal( Vector<float> v ) => Lanes.Reciprocal( v );

		[MethodImpl( MethodImplOptions.AggressiveInlining )]
		public static Vector<float> ReciprocalSqrt( Vector<float> v ) => Lanes.ReciprocalSqrt( v );

		[MethodImpl( MethodImplOptions.AggressiveInlining )]
		public static Vector<int> Max( Vector<int> a, Vector<int> b ) => Lanes.Max( a, b );

		[MethodImpl( MethodImplOptions.AggressiveInlining )]
		public static Vector<int> Min( Vector<int> a, Vector<int> b ) => Lanes.Min( a, b );

		[MethodImpl( MethodImplOptions.AggressiveInlining )]
		public static Vector<int> Abs( Vector<int> v ) => Lanes.Abs( v );
#else
		/// <summary>Whether this build runs the wide math as SIMD instructions.</summary>
		public static bool UsesSimd => true;

		[MethodImpl( MethodImplOptions.AggressiveInlining )]
		public static Vector<float> Max( Vector<float> a, Vector<float> b ) => Vector.Max( a, b );

		[MethodImpl( MethodImplOptions.AggressiveInlining )]
		public static Vector<float> Min( Vector<float> a, Vector<float> b ) => Vector.Min( a, b );

		[MethodImpl( MethodImplOptions.AggressiveInlining )]
		public static Vector<float> Abs( Vector<float> v ) => Vector.Abs( v );

		[MethodImpl( MethodImplOptions.AggressiveInlining )]
		public static Vector<float> Floor( Vector<float> v ) => Vector.Floor( v );

		[MethodImpl( MethodImplOptions.AggressiveInlining )]
		public static Vector<float> Sqrt( Vector<float> v ) => Vector.SquareRoot( v );

		[MethodImpl( MethodImplOptions.AggressiveInlining )]
		public static Vector<float> Reciprocal( Vector<float> v ) => Vector<float>.One / v;

		[MethodImpl( MethodImplOptions.AggressiveInlining )]
		public static Vector<float> ReciprocalSqrt( Vector<float> v ) => Vector<float>.One / Vector.SquareRoot( v );

		[MethodImpl( MethodImplOptions.AggressiveInlining )]
		public static Vector<int> Max( Vector<int> a, Vector<int> b ) => Vector.Max( a, b );

		[MethodImpl( MethodImplOptions.AggressiveInlining )]
		public static Vector<int> Min( Vector<int> a, Vector<int> b ) => Vector.Min( a, b );

		[MethodImpl( MethodImplOptions.AggressiveInlining )]
		public static Vector<int> Abs( Vector<int> v ) => Vector.Abs( v );
#endif

		/// <summary>
		/// The same operations lane by lane through FastMath: what <see cref="FMathWide"/> runs without SIMD. Public in
		/// every build, so the SIMD build's tests check them against Vector's. Without SIMD a Vector&lt;float&gt; is four
		/// floats: they are read and written as a Vector4 (fields, not the indexer), everything inlined.
		/// </summary>
		public static class Lanes
		{
			// Floats from 2^23 up are whole numbers already (and would overflow FMath.Floor's int).
			private const float WHOLE = 8388608f;

			private struct Int4
			{
				public int X, Y, Z, W;
			}

			[MethodImpl( MethodImplOptions.AggressiveInlining )]
			private static ref Vector4 Four( ref Vector<float> v ) => ref Unsafe.As<Vector<float>, Vector4>( ref v );

			[MethodImpl( MethodImplOptions.AggressiveInlining )]
			private static ref Int4 Four( ref Vector<int> v ) => ref Unsafe.As<Vector<int>, Int4>( ref v );

			[MethodImpl( MethodImplOptions.AggressiveInlining )]
			private static Vector<float> Wide( Vector4 v ) => Unsafe.As<Vector4, Vector<float>>( ref v );

			[MethodImpl( MethodImplOptions.AggressiveInlining )]
			private static Vector<int> Wide( Int4 v ) => Unsafe.As<Int4, Vector<int>>( ref v );

			[MethodImpl( MethodImplOptions.AggressiveInlining )]
			private static ref float At( ref Vector<float> v, int i ) => ref Unsafe.Add( ref Unsafe.As<Vector<float>, float>( ref v ), i );

			[MethodImpl( MethodImplOptions.AggressiveInlining )]
			private static ref int At( ref Vector<int> v, int i ) => ref Unsafe.Add( ref Unsafe.As<Vector<int>, int>( ref v ), i );

			[MethodImpl( MethodImplOptions.AggressiveInlining )]
			private static float FloorOf( float x ) => FMath.AbsBranchless( x ) >= WHOLE ? x : FMath.Floor( x );

			[MethodImpl( MethodImplOptions.AggressiveInlining )]
			private static float ReciprocalSqrtOf( float x ) => x > 0f ? FMath.FastInvSqrtPrecise( x ) : float.PositiveInfinity;

			[MethodImpl( MethodImplOptions.AggressiveInlining )]
			public static Vector<float> Max( Vector<float> a, Vector<float> b )
			{
				if ( Vector<float>.Count == 4 )
				{
					ref Vector4 x = ref Four( ref a );
					ref Vector4 y = ref Four( ref b );
					return Wide( new Vector4( FMath.Max( x.X, y.X ), FMath.Max( x.Y, y.Y ), FMath.Max( x.Z, y.Z ), FMath.Max( x.W, y.W ) ) );
				}
				Vector<float> r = default;
				for ( int i = 0; i < Vector<float>.Count; i++ )
				{
					At( ref r, i ) = FMath.Max( At( ref a, i ), At( ref b, i ) );
				}
				return r;
			}

			[MethodImpl( MethodImplOptions.AggressiveInlining )]
			public static Vector<float> Min( Vector<float> a, Vector<float> b )
			{
				if ( Vector<float>.Count == 4 )
				{
					ref Vector4 x = ref Four( ref a );
					ref Vector4 y = ref Four( ref b );
					return Wide( new Vector4( FMath.Min( x.X, y.X ), FMath.Min( x.Y, y.Y ), FMath.Min( x.Z, y.Z ), FMath.Min( x.W, y.W ) ) );
				}
				Vector<float> r = default;
				for ( int i = 0; i < Vector<float>.Count; i++ )
				{
					At( ref r, i ) = FMath.Min( At( ref a, i ), At( ref b, i ) );
				}
				return r;
			}

			[MethodImpl( MethodImplOptions.AggressiveInlining )]
			public static Vector<float> Abs( Vector<float> v )
			{
				if ( Vector<float>.Count == 4 )
				{
					ref Vector4 x = ref Four( ref v );
					return Wide( new Vector4( FMath.AbsBranchless( x.X ), FMath.AbsBranchless( x.Y ), FMath.AbsBranchless( x.Z ), FMath.AbsBranchless( x.W ) ) );
				}
				Vector<float> r = default;
				for ( int i = 0; i < Vector<float>.Count; i++ )
				{
					At( ref r, i ) = FMath.AbsBranchless( At( ref v, i ) );
				}
				return r;
			}

			[MethodImpl( MethodImplOptions.AggressiveInlining )]
			public static Vector<float> Floor( Vector<float> v )
			{
				if ( Vector<float>.Count == 4 )
				{
					ref Vector4 x = ref Four( ref v );
					return Wide( new Vector4( FloorOf( x.X ), FloorOf( x.Y ), FloorOf( x.Z ), FloorOf( x.W ) ) );
				}
				Vector<float> r = default;
				for ( int i = 0; i < Vector<float>.Count; i++ )
				{
					At( ref r, i ) = FloorOf( At( ref v, i ) );
				}
				return r;
			}

			/// <summary>√ per lane (<see cref="FMath.FastSqrtPrecise"/>): 0 for lanes ≤ 0, never NaN.</summary>
			[MethodImpl( MethodImplOptions.AggressiveInlining )]
			public static Vector<float> Sqrt( Vector<float> v )
			{
				if ( Vector<float>.Count == 4 )
				{
					ref Vector4 x = ref Four( ref v );
					return Wide( new Vector4( FMath.FastSqrtPrecise( x.X ), FMath.FastSqrtPrecise( x.Y ), FMath.FastSqrtPrecise( x.Z ), FMath.FastSqrtPrecise( x.W ) ) );
				}
				Vector<float> r = default;
				for ( int i = 0; i < Vector<float>.Count; i++ )
				{
					At( ref r, i ) = FMath.FastSqrtPrecise( At( ref v, i ) );
				}
				return r;
			}

			[MethodImpl( MethodImplOptions.AggressiveInlining )]
			public static Vector<float> Reciprocal( Vector<float> v ) => Vector<float>.One / v;

			/// <summary>1/√ per lane (<see cref="FMath.FastInvSqrtPrecise"/>); lanes ≤ 0 give +∞, as 1/√0 does.</summary>
			[MethodImpl( MethodImplOptions.AggressiveInlining )]
			public static Vector<float> ReciprocalSqrt( Vector<float> v )
			{
				if ( Vector<float>.Count == 4 )
				{
					ref Vector4 x = ref Four( ref v );
					return Wide( new Vector4( ReciprocalSqrtOf( x.X ), ReciprocalSqrtOf( x.Y ), ReciprocalSqrtOf( x.Z ), ReciprocalSqrtOf( x.W ) ) );
				}
				Vector<float> r = default;
				for ( int i = 0; i < Vector<float>.Count; i++ )
				{
					At( ref r, i ) = ReciprocalSqrtOf( At( ref v, i ) );
				}
				return r;
			}

			/// <summary>sin per lane (<see cref="FMath.FastSinPrecise"/>).</summary>
			public static Vector<float> Sin( Vector<float> v )
			{
				if ( Vector<float>.Count == 4 )
				{
					ref Vector4 x = ref Four( ref v );
					return Wide( new Vector4( FMath.FastSinPrecise( x.X ), FMath.FastSinPrecise( x.Y ), FMath.FastSinPrecise( x.Z ), FMath.FastSinPrecise( x.W ) ) );
				}
				Vector<float> r = default;
				for ( int i = 0; i < Vector<float>.Count; i++ )
				{
					At( ref r, i ) = FMath.FastSinPrecise( At( ref v, i ) );
				}
				return r;
			}

			/// <summary>cos per lane (<see cref="FMath.FastCosPrecise"/>).</summary>
			public static Vector<float> Cos( Vector<float> v )
			{
				if ( Vector<float>.Count == 4 )
				{
					ref Vector4 x = ref Four( ref v );
					return Wide( new Vector4( FMath.FastCosPrecise( x.X ), FMath.FastCosPrecise( x.Y ), FMath.FastCosPrecise( x.Z ), FMath.FastCosPrecise( x.W ) ) );
				}
				Vector<float> r = default;
				for ( int i = 0; i < Vector<float>.Count; i++ )
				{
					At( ref r, i ) = FMath.FastCosPrecise( At( ref v, i ) );
				}
				return r;
			}

			/// <summary>acos per lane (<see cref="FMath.FastAcosPrecise"/>), inputs clamped to [-1, 1].</summary>
			public static Vector<float> Acos( Vector<float> v )
			{
				if ( Vector<float>.Count == 4 )
				{
					ref Vector4 x = ref Four( ref v );
					return Wide( new Vector4( FMath.FastAcosPrecise( x.X ), FMath.FastAcosPrecise( x.Y ), FMath.FastAcosPrecise( x.Z ), FMath.FastAcosPrecise( x.W ) ) );
				}
				Vector<float> r = default;
				for ( int i = 0; i < Vector<float>.Count; i++ )
				{
					At( ref r, i ) = FMath.FastAcosPrecise( At( ref v, i ) );
				}
				return r;
			}

			[MethodImpl( MethodImplOptions.AggressiveInlining )]
			public static Vector<int> Max( Vector<int> a, Vector<int> b )
			{
				if ( Vector<int>.Count == 4 )
				{
					ref Int4 x = ref Four( ref a );
					ref Int4 y = ref Four( ref b );
					return Wide( new Int4 { X = FMath.Max( x.X, y.X ), Y = FMath.Max( x.Y, y.Y ), Z = FMath.Max( x.Z, y.Z ), W = FMath.Max( x.W, y.W ) } );
				}
				Vector<int> r = default;
				for ( int i = 0; i < Vector<int>.Count; i++ )
				{
					At( ref r, i ) = FMath.Max( At( ref a, i ), At( ref b, i ) );
				}
				return r;
			}

			[MethodImpl( MethodImplOptions.AggressiveInlining )]
			public static Vector<int> Min( Vector<int> a, Vector<int> b )
			{
				if ( Vector<int>.Count == 4 )
				{
					ref Int4 x = ref Four( ref a );
					ref Int4 y = ref Four( ref b );
					return Wide( new Int4 { X = FMath.Min( x.X, y.X ), Y = FMath.Min( x.Y, y.Y ), Z = FMath.Min( x.Z, y.Z ), W = FMath.Min( x.W, y.W ) } );
				}
				Vector<int> r = default;
				for ( int i = 0; i < Vector<int>.Count; i++ )
				{
					At( ref r, i ) = FMath.Min( At( ref a, i ), At( ref b, i ) );
				}
				return r;
			}

			[MethodImpl( MethodImplOptions.AggressiveInlining )]
			public static Vector<int> Abs( Vector<int> v )
			{
				if ( Vector<int>.Count == 4 )
				{
					ref Int4 x = ref Four( ref v );
					return Wide( new Int4 { X = FMath.AbsBranchless( x.X ), Y = FMath.AbsBranchless( x.Y ), Z = FMath.AbsBranchless( x.Z ), W = FMath.AbsBranchless( x.W ) } );
				}
				Vector<int> r = default;
				for ( int i = 0; i < Vector<int>.Count; i++ )
				{
					At( ref r, i ) = FMath.AbsBranchless( At( ref v, i ) );
				}
				return r;
			}
		}
	}
}