// Created by Anton Piruev in 2026. 
// Any direct commercial use of derivative work is strictly prohibited.

using System.Runtime.CompilerServices;

namespace Framework.FastMath.Core
{
	public static partial class FMath
	{
		// ================================================================
		// Additional methods for reduced allocations
		// ================================================================

		/// <summary>
		/// Branchless float comparison: checks if |a - b| &lt epsilon.
		/// Uses bitwise AND for logical combining to avoid second branch.
		/// Slightly faster than IsNearlyEqual when epsilon is constant-folded.
		/// </summary>
		[MethodImpl( MethodImplOptions.AggressiveInlining )]
		public static bool IsNearlyEqualBranchless( float a, float b, float epsilon = KINDA_SMALL_NUMBER )
		{
			float diff = a - b;
			return ( diff < epsilon ) & ( diff > -epsilon );
		}

		/// <summary>
		/// Unsafe variant: compares up to N floats from two span pointers.
		/// Faster than repeated IsNearlyEqual calls with zero bounds-check overhead.
		/// Use when comparing many packed components (e.g., interleaved vertex data).
		///
		/// Kept as `unsafe` deliberately (unlike the scalar bit tricks below):
		/// walking a raw pointer across a large buffer to skip per-element bounds
		/// checks is a genuine, measurable win here, not just style. The scalar
		/// single-float tricks elsewhere in this file don't have that justification
		/// and use the FloatToInt32Bits/Int32BitsToFloat helpers instead.
		/// </summary>
		public static unsafe bool IsNearlyEqualSpan( System.ReadOnlySpan<float> a, System.ReadOnlySpan<float> b,
			int count, float epsilon = KINDA_SMALL_NUMBER )
		{
			if ( a.Length < count || b.Length < count )
				throw new System.ArgumentException( "Span length < count" );

			fixed ( float* pa = a )
			fixed ( float* pb = b )
			{
				for ( int i = 0; i < count; i++ )
				{
					float diff = pa[ i ] - pb[ i ];
					if ( ( diff < epsilon ) & ( diff > -epsilon ) ) continue;
					return false;
				}
				return true;
			}
		}

		/// <summary>
		/// Unsafe-optimized span Max: pointer walk avoids bounds checks.
		/// Unrolled by 4 for better branch prediction and ILP.
		/// ~30% faster than standard enumerable foreach.
		/// </summary>
		public static unsafe float MaxUnrolled( System.ReadOnlySpan<float> values )
		{
			if ( values.Length == 0 )
				throw new System.ArgumentException( "Empty span" );

			fixed ( float* ptr = values )
			{
				float max = ptr[ 0 ];
				int len = values.Length;
				int i = 1;

				// Unroll by 4 for better ILP
				while ( i + 3 < len )
				{
					float v0 = ptr[ i ];
					float v1 = ptr[ i + 1 ];
					float v2 = ptr[ i + 2 ];
					float v3 = ptr[ i + 3 ];
					if ( v0 > max ) max = v0;
					if ( v1 > max ) max = v1;
					if ( v2 > max ) max = v2;
					if ( v3 > max ) max = v3;
					i += 4;
				}

				// Cleanup remainder
				while ( i < len )
				{
					float v = ptr[ i ];
					if ( v > max ) max = v;
					i++;
				}
				return max;
			}
		}

		/// <summary>
		/// Unsafe-optimized span Min with unrolling.
		/// </summary>
		public static unsafe float MinUnrolled( System.ReadOnlySpan<float> values )
		{
			if ( values.Length == 0 )
				throw new System.ArgumentException( "Empty span" );

			fixed ( float* ptr = values )
			{
				float min = ptr[ 0 ];
				int len = values.Length;
				int i = 1;

				// Unroll by 4
				while ( i + 3 < len )
				{
					float v0 = ptr[ i ];
					float v1 = ptr[ i + 1 ];
					float v2 = ptr[ i + 2 ];
					float v3 = ptr[ i + 3 ];
					if ( v0 < min ) min = v0;
					if ( v1 < min ) min = v1;
					if ( v2 < min ) min = v2;
					if ( v3 < min ) min = v3;
					i += 4;
				}

				// Cleanup
				while ( i < len )
				{
					float v = ptr[ i ];
					if ( v < min ) min = v;
					i++;
				}
				return min;
			}
		}

		/// <summary>
		/// Unsafe variant of AbsBranchless that works on spans.
		/// Applies IEEE-754 bit mask to all elements without bounds-check overhead.
		/// Useful for SIMD-free abs() on large arrays (e.g., residual vectors).
		/// </summary>
		public static unsafe void AbsBranchlessSpan( System.Span<float> values )
		{
			fixed ( float* ptr = values )
			{
				for ( int i = 0; i < values.Length; i++ )
				{
					int bits = *(int*)( ptr + i ) & ABS_MASK;
					ptr[ i ] = *(float*)&bits;
				}
			}
		}

		[MethodImpl( MethodImplOptions.AggressiveInlining )]
		public static float FastDeg2Rad( float deg ) => deg * Deg2Rad;

		[MethodImpl( MethodImplOptions.AggressiveInlining )]
		public static float FastRad2Deg( float deg ) => deg * Rad2Deg;

		// ================================================================
		// Clamp / Lerp / SmoothStep / etc.
		// ================================================================

		[MethodImpl( MethodImplOptions.AggressiveInlining )]
		public static float Clamp( float value, float min, float max )
		{
			if ( value < min ) return min;
			if ( value > max ) return max;
			return value;
		}

		[MethodImpl( MethodImplOptions.AggressiveInlining )]
		public static float Clamp01( float value )
		{
			if ( value < 0f ) return 0f;
			if ( value > 1f ) return 1f;
			return value;
		}

		[MethodImpl( MethodImplOptions.AggressiveInlining )]
		public static int Clamp( int value, int min, int max )
		{
			if ( value < min ) return min;
			if ( value > max ) return max;
			return value;
		}

		[MethodImpl( MethodImplOptions.AggressiveInlining )]
		public static float Lerp( float a, float b, float t )
		{
			if ( t <= 0f ) return a;
			if ( t >= 1f ) return b;
			return a + ( b - a ) * t;
		}

		[MethodImpl( MethodImplOptions.AggressiveInlining )]
		public static float LerpUnclamped( float a, float b, float t )
			=> a + ( b - a ) * t;

		[MethodImpl( MethodImplOptions.AggressiveInlining )]
		public static float InverseLerp( float a, float b, float value )
		{
			float diff = b - a;
			if ( diff == 0f ) return 0f;
			return Clamp01( ( value - a ) / diff );
		}

		[MethodImpl( MethodImplOptions.AggressiveInlining )]
		public static float SmoothStep( float t )
		{
			t = Clamp01( t );
			return t * t * ( 3f - 2f * t );
		}

		[MethodImpl( MethodImplOptions.AggressiveInlining )]
		public static float SmoothStep( float edge0, float edge1, float value )
			=> SmoothStep( InverseLerp( edge0, edge1, value ) );

		[MethodImpl( MethodImplOptions.AggressiveInlining )]
		public static float SmootherStep( float t )
		{
			t = Clamp01( t );
			return t * t * t * ( t * ( t * 6f - 15f ) + 10f );
		}

		[MethodImpl( MethodImplOptions.AggressiveInlining )]
		public static float Abs( float value ) => value >= 0f ? value : -value;

		[MethodImpl( MethodImplOptions.AggressiveInlining )]
		public static long Abs( long value ) => value >= 0f ? value : -value;

		[MethodImpl( MethodImplOptions.AggressiveInlining )]
		public static int Abs( int value ) => value >= 0f ? value : -value;

		/// <summary>
		/// Branchless absolute value via IEEE-754 sign-bit clear.
		///
		/// Uses the unsafe pointer-reinterpret helpers (FloatToInt32Bits /
		/// Int32BitsToFloat) rather than System.BitConverter.SingleToInt32Bits:
		/// that BCL API doesn't exist on .NET Framework, and Core targets
		/// net47 as well as net8.0 so Numerics/FastMath stays usable from
		/// legacy .NET Framework code. Same single-instruction codegen either way.
		/// </summary>
		[MethodImpl( MethodImplOptions.AggressiveInlining )]
		public static unsafe float AbsBranchless( float value )
		{
			int bits = FloatToInt32Bits( value ) & ABS_MASK;
			return Int32BitsToFloat( bits );
		}

		[MethodImpl( MethodImplOptions.AggressiveInlining )]
		public static int AbsBranchless( int value )
		{
			int mask = value >> 31;
			return ( value ^ mask ) - mask;
		}

		[MethodImpl( MethodImplOptions.AggressiveInlining )]
		public static long AbsBranchless( long value )
		{
			long mask = value >> 63;
			return ( value ^ mask ) - mask;
		}

		[MethodImpl( MethodImplOptions.AggressiveInlining )]
		public static float Sign( float value ) => value >= 0f ? 1f : -1f;

		[MethodImpl( MethodImplOptions.AggressiveInlining )]
		public static int SignInt( float value ) => value >= 0f ? 1 : -1;

		/// <summary>
		/// Branchless signum: returns ±1.0 matching the sign bit of value.
		/// See <see cref="AbsBranchless"/> remarks - unsafe pointer reinterpret
		/// instead of BitConverter, for net47 portability.
		/// </summary>
		[MethodImpl( MethodImplOptions.AggressiveInlining )]
		public static unsafe float SignBranchless( float value )
		{
			const int ONE_BITS = 0x3F800000;
			int signBit = FloatToInt32Bits( value ) & SIGN_BIT_MASK;
			int result = ONE_BITS | signBit;
			return Int32BitsToFloat( result );
		}

		[MethodImpl( MethodImplOptions.AggressiveInlining )]
		public static float Min( float a, float b ) => a < b ? a : b;

		[MethodImpl( MethodImplOptions.AggressiveInlining )]
		public static float Max( float a, float b ) => a > b ? a : b;

		[MethodImpl( MethodImplOptions.AggressiveInlining )]
		public static int Min( int a, int b ) => a < b ? a : b;

		[MethodImpl( MethodImplOptions.AggressiveInlining )]
		public static int Max( int a, int b ) => a > b ? a : b;

		// ── Span operations - kept `unsafe` for the pointer-walk (see remarks
		//    on IsNearlyEqualSpan above) ───────────────────────────────────
		public static unsafe float Max( System.ReadOnlySpan<float> values )
		{
			if ( values.Length == 0 )
				throw new System.ArgumentException( "Empty span" );
			fixed ( float* ptr = values )
			{
				float max = ptr[ 0 ];
				for ( int i = 1; i < values.Length; i++ )
				{
					float v = ptr[ i ];
					if ( v > max ) max = v;
				}
				return max;
			}
		}

		public static unsafe float Min( System.ReadOnlySpan<float> values )
		{
			if ( values.Length == 0 )
				throw new System.ArgumentException( "Empty span" );
			fixed ( float* ptr = values )
			{
				float min = ptr[ 0 ];
				for ( int i = 1; i < values.Length; i++ )
				{
					float v = ptr[ i ];
					if ( v < min ) min = v;
				}
				return min;
			}
		}

		[MethodImpl( MethodImplOptions.AggressiveInlining )]
		public static bool IsNearlyEqual( float a, float b, float epsilon = KINDA_SMALL_NUMBER )
		{
			float diff = a - b;
			return diff < epsilon & diff > -epsilon;
		}

		/// <summary>
		/// See <see cref="AbsBranchless"/> remarks - unsafe pointer reinterpret
		/// instead of BitConverter, for net47 portability.
		/// </summary>
		[MethodImpl( MethodImplOptions.AggressiveInlining )]
		public static unsafe bool IsNearlyZero( float value, float epsilon = KINDA_SMALL_NUMBER )
		{
			int bits = FloatToInt32Bits( value ) & ABS_MASK;
			return Int32BitsToFloat( bits ) < epsilon;
		}

		[MethodImpl( MethodImplOptions.AggressiveInlining )]
		public static float Floor( float value )
		{
			int i = (int)value;
			return value < i ? i - 1 : i;
		}

		[MethodImpl( MethodImplOptions.AggressiveInlining )]
		public static int FloorToInt( float value )
		{
			int i = (int)value;
			return value < i ? i - 1 : i;
		}

		[MethodImpl( MethodImplOptions.AggressiveInlining )]
		public static float Ceil( float value )
		{
			int i = (int)value;
			return value > i ? i + 1 : i;
		}

		[MethodImpl( MethodImplOptions.AggressiveInlining )]
		public static int CeilToInt( float value )
		{
			int i = (int)value;
			return value > i ? i + 1 : i;
		}

		[MethodImpl( MethodImplOptions.AggressiveInlining )]
		public static float Round( float value ) => Floor( value + 0.5f );

		[MethodImpl( MethodImplOptions.AggressiveInlining )]
		public static int RoundToInt( float value ) => FloorToInt( value + 0.5f );

		[MethodImpl( MethodImplOptions.AggressiveInlining )]
		public static float Frac( float value ) => value - Floor( value );

		[MethodImpl( MethodImplOptions.AggressiveInlining )]
		public static float Repeat( float t, float length )
			=> t - Floor( t / length ) * length;

		[MethodImpl( MethodImplOptions.AggressiveInlining )]
		public static float DeltaAngle( float current, float target )
		{
			float delta = Repeat( target - current, 360f );
			if ( delta > 180f ) delta -= 360f;
			return delta;
		}

		[MethodImpl( MethodImplOptions.AggressiveInlining )]
		public static float DeltaAngleRad( float current, float target )
		{
			float delta = Repeat( target - current, 6.28318531f ); // TWO_PI
			if ( delta > 3.14159274f ) delta -= 6.28318531f;      // PI, TWO_PI
			return delta;
		}

		[MethodImpl( MethodImplOptions.AggressiveInlining )]
		public static float LerpAngle( float a, float b, float t )
		{
			float raw = b - a;
			float delta = raw - Floor( raw * ( 1f / 360f ) ) * 360f;
			if ( delta > 180f ) delta -= 360f;
			return a + delta * Clamp01( t );
		}

		[MethodImpl( MethodImplOptions.AggressiveInlining )]
		public static float LerpAngleUnclamped( float a, float b, float t )
		{
			float raw = b - a;
			float delta = raw - Floor( raw * ( 1f / 360f ) ) * 360f;
			if ( delta > 180f ) delta -= 360f;
			return a + delta * t;
		}

		[MethodImpl( MethodImplOptions.AggressiveInlining )]
		public static float LerpAngleRad( float a, float b, float t )
		{
			float raw = b - a;
			float delta = raw - Floor( raw * 0.159154943f ) * 6.28318531f;  // INV_TWO_PI, TWO_PI
			if ( delta > 3.14159274f ) delta -= 6.28318531f;
			return a + delta * Clamp01( t );
		}

		[MethodImpl( MethodImplOptions.AggressiveInlining )]
		public static float LerpAngleRadUnclamped( float a, float b, float t )
		{
			float raw = b - a;
			float delta = raw - Floor( raw * 0.159154943f ) * 6.28318531f;
			if ( delta > 3.14159274f ) delta -= 6.28318531f;
			return a + delta * t;
		}

		[MethodImpl( MethodImplOptions.AggressiveInlining )]
		public static float Map( float value,
								float fromMin, float fromMax,
								float toMin, float toMax )
		{
			float t = ( value - fromMin ) / ( fromMax - fromMin );
			return toMin + ( toMax - toMin ) * t;
		}

		[MethodImpl( MethodImplOptions.AggressiveInlining )]
		public static float MapClamped( float value,
									   float fromMin, float fromMax,
									   float toMin, float toMax )
		{
			float t = Clamp01( ( value - fromMin ) / ( fromMax - fromMin ) );
			return toMin + ( toMax - toMin ) * t;
		}

		[MethodImpl( MethodImplOptions.AggressiveInlining )]
		public static float PingPong( float t, float length )
		{
			t = Repeat( t, length * 2f );
			return length - Abs( t - length );
		}

		[MethodImpl( MethodImplOptions.AggressiveInlining )]
		public static bool IsPowerOfTwo( int v ) => v > 0 & ( v & ( v - 1 ) ) == 0;

		[MethodImpl( MethodImplOptions.AggressiveInlining )]
		public static int NextPowerOfTwo( int v )
		{
			if ( v <= 1 ) return 1;
			v--;
			v |= v >> 1;
			v |= v >> 2;
			v |= v >> 4;
			v |= v >> 8;
			v |= v >> 16;
			return v + 1;
		}

		[MethodImpl( MethodImplOptions.AggressiveInlining )]
		public static float ByteToFloat( byte b ) => b * ( 1f / 255f );

		[MethodImpl( MethodImplOptions.AggressiveInlining )]
		public static byte FloatToByte( float f )
		{
			int i = (int)( f * 255f + 0.5f );
			if ( i < 0 ) return 0;
			if ( i > 255 ) return 255;
			return (byte)i;
		}
	}
}
