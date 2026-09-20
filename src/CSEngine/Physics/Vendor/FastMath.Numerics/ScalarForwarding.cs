// Created by Anton Piruev in 2026.
// Any direct commercial use of derivative work is strictly prohibited.

using System.Runtime.CompilerServices;
using CoreMath = Framework.FastMath.Core.FMath;

namespace Framework.FastMath.Numerics
{
	public static partial class FMath
	{
		#region Constants

		public const float KINDA_SMALL_NUMBER = CoreMath.KINDA_SMALL_NUMBER;
		public const float SMALL_NUMBER = CoreMath.SMALL_NUMBER;
		public const float ACTUALLY_SMALL_NUMBER = CoreMath.ACTUALLY_SMALL_NUMBER;

		public const float PI = CoreMath.PI;
		public const float TWO_PI = CoreMath.TWO_PI;
		public const float HALF_PI = CoreMath.HALF_PI;
		public const float QUARTER_PI = CoreMath.QUARTER_PI;
		public const float THREE_QTR_PI = CoreMath.THREE_QTR_PI;
		public const float INV_PI = CoreMath.INV_PI;
		public const float INV_TWO_PI = CoreMath.INV_TWO_PI;
		public const float INV_360 = CoreMath.INV_360;

		public const float Deg2Rad = CoreMath.Deg2Rad;
		public const float Rad2Deg = CoreMath.Rad2Deg;

		public const float INV_3 = CoreMath.INV_3;
		public const float INV_6 = CoreMath.INV_6;
		public const float INV_255 = CoreMath.INV_255;
		public const float SQRT2 = CoreMath.SQRT2;
		public const float INV_SQRT2 = CoreMath.INV_SQRT2;
		public const float SQRT3 = CoreMath.SQRT3;
		public const float INV_SQRT3 = CoreMath.INV_SQRT3;
		public const float GOLDEN_RATIO = CoreMath.GOLDEN_RATIO;

		public const float SAFE_SQUARE_THRESHOLD = CoreMath.SAFE_SQUARE_THRESHOLD;

		#endregion

		#region FastInvSqrt / FastSqrt

		[MethodImpl( MethodImplOptions.AggressiveInlining )]
		public static float FastInvSqrt( float x, bool precise = false ) => CoreMath.FastInvSqrt( x, precise );

		[MethodImpl( MethodImplOptions.AggressiveInlining )]
		public static float FastSqrt( float x ) => CoreMath.FastSqrt( x );

		#endregion

		#region FastPow

		[MethodImpl( MethodImplOptions.AggressiveInlining )]
		public static float FastPow( float x, float p ) => CoreMath.FastPow( x, p );

		[MethodImpl( MethodImplOptions.AggressiveInlining )]
		public static float FastPrecisePow( float x, float p ) => CoreMath.FastPrecisePow( x, p );

		#endregion

		#region Trigonometry

		[MethodImpl( MethodImplOptions.AggressiveInlining )]
		public static float FastAtan( float x, bool precise = false ) => CoreMath.FastAtan( x, precise );

		[MethodImpl( MethodImplOptions.AggressiveInlining )]
		public static float FastAtan2( float y, float x, bool precise = false ) => CoreMath.FastAtan2( y, x, precise );

		[MethodImpl( MethodImplOptions.AggressiveInlining )]
		public static float FastSin( float x ) => CoreMath.FastSin( x );

		[MethodImpl( MethodImplOptions.AggressiveInlining )]
		public static float FastCos( float x ) => CoreMath.FastCos( x );

		#endregion

		#region Scalar-only sqrt/length/distance (3-component)

		[MethodImpl( MethodImplOptions.AggressiveInlining )]
		public static void FastNormalize( ref float x, ref float y, ref float z, float epsilon = SMALL_NUMBER )
			=> CoreMath.FastNormalize( ref x, ref y, ref z, epsilon );

		[MethodImpl( MethodImplOptions.AggressiveInlining )]
		public static float FastLength( float x, float y, float z, float epsilon = SMALL_NUMBER )
			=> CoreMath.FastLength( x, y, z, epsilon );

		[MethodImpl( MethodImplOptions.AggressiveInlining )]
		public static float FastDistance( float x1, float y1, float z1, float x2, float y2, float z2 )
			=> CoreMath.FastDistance( x1, y1, z1, x2, y2, z2 );

		[MethodImpl( MethodImplOptions.AggressiveInlining )]
		public static float DistanceSquared( float x1, float y1, float z1, float x2, float y2, float z2 )
			=> CoreMath.DistanceSquared( x1, y1, z1, x2, y2, z2 );

		#endregion

		#region Clamp / Lerp / SmoothStep / etc.

		[MethodImpl( MethodImplOptions.AggressiveInlining )]
		public static bool IsNearlyEqualBranchless( float a, float b, float epsilon = KINDA_SMALL_NUMBER )
			=> CoreMath.IsNearlyEqualBranchless( a, b, epsilon );

		public static bool IsNearlyEqualSpan( System.ReadOnlySpan<float> a, System.ReadOnlySpan<float> b,
			int count, float epsilon = KINDA_SMALL_NUMBER )
			=> CoreMath.IsNearlyEqualSpan( a, b, count, epsilon );

		public static float MaxUnrolled( System.ReadOnlySpan<float> values ) => CoreMath.MaxUnrolled( values );

		public static float MinUnrolled( System.ReadOnlySpan<float> values ) => CoreMath.MinUnrolled( values );

		public static void AbsBranchlessSpan( System.Span<float> values ) => CoreMath.AbsBranchlessSpan( values );

		[MethodImpl( MethodImplOptions.AggressiveInlining )]
		public static float FastDeg2Rad( float deg ) => CoreMath.FastDeg2Rad( deg );

		[MethodImpl( MethodImplOptions.AggressiveInlining )]
		public static float FastRad2Deg( float deg ) => CoreMath.FastRad2Deg( deg );

		[MethodImpl( MethodImplOptions.AggressiveInlining )]
		public static float Clamp( float value, float min, float max ) => CoreMath.Clamp( value, min, max );

		[MethodImpl( MethodImplOptions.AggressiveInlining )]
		public static float Clamp01( float value ) => CoreMath.Clamp01( value );

		[MethodImpl( MethodImplOptions.AggressiveInlining )]
		public static int Clamp( int value, int min, int max ) => CoreMath.Clamp( value, min, max );

		[MethodImpl( MethodImplOptions.AggressiveInlining )]
		public static float Lerp( float a, float b, float t ) => CoreMath.Lerp( a, b, t );

		[MethodImpl( MethodImplOptions.AggressiveInlining )]
		public static float LerpUnclamped( float a, float b, float t ) => CoreMath.LerpUnclamped( a, b, t );

		[MethodImpl( MethodImplOptions.AggressiveInlining )]
		public static float InverseLerp( float a, float b, float value ) => CoreMath.InverseLerp( a, b, value );

		[MethodImpl( MethodImplOptions.AggressiveInlining )]
		public static float SmoothStep( float t ) => CoreMath.SmoothStep( t );

		[MethodImpl( MethodImplOptions.AggressiveInlining )]
		public static float SmoothStep( float edge0, float edge1, float value ) => CoreMath.SmoothStep( edge0, edge1, value );

		[MethodImpl( MethodImplOptions.AggressiveInlining )]
		public static float SmootherStep( float t ) => CoreMath.SmootherStep( t );

		[MethodImpl( MethodImplOptions.AggressiveInlining )]
		public static float Abs( float value ) => CoreMath.Abs( value );

		[MethodImpl( MethodImplOptions.AggressiveInlining )]
		public static float AbsBranchless( float value ) => CoreMath.AbsBranchless( value );

		[MethodImpl( MethodImplOptions.AggressiveInlining )]
		public static int AbsBranchless( int value ) => CoreMath.AbsBranchless( value );

		[MethodImpl( MethodImplOptions.AggressiveInlining )]
		public static long AbsBranchless( long value ) => CoreMath.AbsBranchless( value );

		[MethodImpl( MethodImplOptions.AggressiveInlining )]
		public static float Sign( float value ) => CoreMath.Sign( value );

		[MethodImpl( MethodImplOptions.AggressiveInlining )]
		public static int SignInt( float value ) => CoreMath.SignInt( value );

		[MethodImpl( MethodImplOptions.AggressiveInlining )]
		public static float SignBranchless( float value ) => CoreMath.SignBranchless( value );

		[MethodImpl( MethodImplOptions.AggressiveInlining )]
		public static float Min( float a, float b ) => CoreMath.Min( a, b );

		[MethodImpl( MethodImplOptions.AggressiveInlining )]
		public static float Max( float a, float b ) => CoreMath.Max( a, b );

		[MethodImpl( MethodImplOptions.AggressiveInlining )]
		public static int Min( int a, int b ) => CoreMath.Min( a, b );

		[MethodImpl( MethodImplOptions.AggressiveInlining )]
		public static int Max( int a, int b ) => CoreMath.Max( a, b );

		public static float Max( System.ReadOnlySpan<float> values ) => CoreMath.Max( values );

		public static float Min( System.ReadOnlySpan<float> values ) => CoreMath.Min( values );

		[MethodImpl( MethodImplOptions.AggressiveInlining )]
		public static bool IsNearlyEqual( float a, float b, float epsilon = KINDA_SMALL_NUMBER )
			=> CoreMath.IsNearlyEqual( a, b, epsilon );

		[MethodImpl( MethodImplOptions.AggressiveInlining )]
		public static bool IsNearlyZero( float value, float epsilon = KINDA_SMALL_NUMBER )
			=> CoreMath.IsNearlyZero( value, epsilon );

		[MethodImpl( MethodImplOptions.AggressiveInlining )]
		public static float Floor( float value ) => CoreMath.Floor( value );

		[MethodImpl( MethodImplOptions.AggressiveInlining )]
		public static int FloorToInt( float value ) => CoreMath.FloorToInt( value );

		[MethodImpl( MethodImplOptions.AggressiveInlining )]
		public static float Ceil( float value ) => CoreMath.Ceil( value );

		[MethodImpl( MethodImplOptions.AggressiveInlining )]
		public static int CeilToInt( float value ) => CoreMath.CeilToInt( value );

		[MethodImpl( MethodImplOptions.AggressiveInlining )]
		public static float Round( float value ) => CoreMath.Round( value );

		[MethodImpl( MethodImplOptions.AggressiveInlining )]
		public static int RoundToInt( float value ) => CoreMath.RoundToInt( value );

		[MethodImpl( MethodImplOptions.AggressiveInlining )]
		public static float Frac( float value ) => CoreMath.Frac( value );

		[MethodImpl( MethodImplOptions.AggressiveInlining )]
		public static float Repeat( float t, float length ) => CoreMath.Repeat( t, length );

		[MethodImpl( MethodImplOptions.AggressiveInlining )]
		public static float DeltaAngle( float current, float target ) => CoreMath.DeltaAngle( current, target );

		[MethodImpl( MethodImplOptions.AggressiveInlining )]
		public static float DeltaAngleRad( float current, float target ) => CoreMath.DeltaAngleRad( current, target );

		[MethodImpl( MethodImplOptions.AggressiveInlining )]
		public static float LerpAngle( float a, float b, float t ) => CoreMath.LerpAngle( a, b, t );

		[MethodImpl( MethodImplOptions.AggressiveInlining )]
		public static float LerpAngleUnclamped( float a, float b, float t ) => CoreMath.LerpAngleUnclamped( a, b, t );

		[MethodImpl( MethodImplOptions.AggressiveInlining )]
		public static float LerpAngleRad( float a, float b, float t ) => CoreMath.LerpAngleRad( a, b, t );

		[MethodImpl( MethodImplOptions.AggressiveInlining )]
		public static float LerpAngleRadUnclamped( float a, float b, float t ) => CoreMath.LerpAngleRadUnclamped( a, b, t );

		[MethodImpl( MethodImplOptions.AggressiveInlining )]
		public static float Map( float value, float fromMin, float fromMax, float toMin, float toMax )
			=> CoreMath.Map( value, fromMin, fromMax, toMin, toMax );

		[MethodImpl( MethodImplOptions.AggressiveInlining )]
		public static float MapClamped( float value, float fromMin, float fromMax, float toMin, float toMax )
			=> CoreMath.MapClamped( value, fromMin, fromMax, toMin, toMax );

		[MethodImpl( MethodImplOptions.AggressiveInlining )]
		public static float PingPong( float t, float length ) => CoreMath.PingPong( t, length );

		[MethodImpl( MethodImplOptions.AggressiveInlining )]
		public static bool IsPowerOfTwo( int v ) => CoreMath.IsPowerOfTwo( v );

		[MethodImpl( MethodImplOptions.AggressiveInlining )]
		public static int NextPowerOfTwo( int v ) => CoreMath.NextPowerOfTwo( v );

		[MethodImpl( MethodImplOptions.AggressiveInlining )]
		public static float Power( float x, float p, bool precise = false ) =>
			CoreMath.FastPow( x, p, precise );

		[MethodImpl( MethodImplOptions.AggressiveInlining )]
		public static float Log2( float x ) =>
			CoreMath.FastLog2( x );

		[MethodImpl( MethodImplOptions.AggressiveInlining )]
		public static float ByteToFloat( byte b ) => CoreMath.ByteToFloat( b );

		[MethodImpl( MethodImplOptions.AggressiveInlining )]
		public static byte FloatToByte( float f ) => CoreMath.FloatToByte( f );

		[MethodImpl( MethodImplOptions.AggressiveInlining )]
		public static float FastAcos( float x, bool precise = false ) =>
			CoreMath.FastAcos( x, precise );

		#endregion
	}
}
