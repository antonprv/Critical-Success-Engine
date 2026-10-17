// Created by Anton Piruev in 2026.
// Any direct commercial use of derivative work is strictly prohibited.

using FastMath;

using System.Numerics;

using Xunit;

namespace Physics.Tests
{
	/// <summary>
	/// FMathWide: the wide math CSPhysics runs on. With SIMD it is Vector&lt;T&gt;'s; the fallback build (no WebAssembly
	/// SIMD, CSE_NO_SIMD) runs FMathWide.Lanes, FastMath per lane. Both are checked here on the same inputs.
	/// </summary>
	public class WideMath
	{
		private static Vector<float> Floats( params float[] lanes )
		{
			float[] values = new float[ Vector<float>.Count ];
			for ( int i = 0; i < values.Length; i++ )
			{
				values[ i ] = lanes[ i % lanes.Length ];
			}
			return new Vector<float>( values );
		}

		private static Vector<int> Ints( params int[] lanes )
		{
			int[] values = new int[ Vector<int>.Count ];
			for ( int i = 0; i < values.Length; i++ )
			{
				values[ i ] = lanes[ i % lanes.Length ];
			}
			return new Vector<int>( values );
		}

		private static void Close( Vector<float> expected, Vector<float> actual, float relative )
		{
			for ( int i = 0; i < Vector<float>.Count; i++ )
			{
				Assert.InRange( actual[ i ], expected[ i ] - FMath.Abs( expected[ i ] ) * relative - 1e-30f, expected[ i ] + FMath.Abs( expected[ i ] ) * relative + 1e-30f );
			}
		}

		[Fact]
		public void TheLanesMatchVectorMathWhereItIsExact()
		{
			Vector<float> a = Floats( -3.5f, 0, 2.25f, 1e6f );
			Vector<float> b = Floats( 1, -0.5f, 2.25f, -1e6f );
			Assert.Equal( Vector.Max( a, b ), FMathWide.Lanes.Max( a, b ) );
			Assert.Equal( Vector.Min( a, b ), FMathWide.Lanes.Min( a, b ) );
			Assert.Equal( Vector.Abs( a ), FMathWide.Lanes.Abs( a ) );
			Assert.Equal( Vector.Floor( Floats( -2.5f, -0.5f, 0.75f, 3 ) ), FMathWide.Lanes.Floor( Floats( -2.5f, -0.5f, 0.75f, 3 ) ) );
			Assert.Equal( Vector<float>.One / b, FMathWide.Lanes.Reciprocal( b ) );

			Vector<int> c = Ints( -7, 0, 5, int.MaxValue );
			Vector<int> d = Ints( 3, -1, 5, int.MinValue + 1 );
			Assert.Equal( Vector.Max( c, d ), FMathWide.Lanes.Max( c, d ) );
			Assert.Equal( Vector.Min( c, d ), FMathWide.Lanes.Min( c, d ) );
			Assert.Equal( Vector.Abs( d ), FMathWide.Lanes.Abs( d ) );
		}

		[Fact]
		public void RootsAreFastMathsWithinTwoTenthsOfAMillionth()
		{
			Vector<float> positive = Floats( 1e-6f, 0.5f, 2, 12345.678f );
			Close( Vector.SquareRoot( positive ), FMathWide.Lanes.Sqrt( positive ), 2e-7f );
			Close( Vector<float>.One / Vector.SquareRoot( positive ), FMathWide.Lanes.ReciprocalSqrt( positive ), 2e-7f );
			// Zero and below give 0, not NaN: a bit of rounding below zero doesn't poison a body.
			Assert.Equal( Vector<float>.Zero, FMathWide.Lanes.Sqrt( Floats( 0, -1e-9f, -4, 0 ) ) );
		}

		[Fact]
		public void FastSqrtPreciseIsTwoNewtonStepsOfTheFastInverseRoot()
		{
			for ( float x = 1e-4f; x < 1e5f; x *= 1.37f )
			{
				Assert.InRange( FMath.FastSqrtPrecise( x ), MathF.Sqrt( x ) * ( 1 - 2e-7f ), MathF.Sqrt( x ) * ( 1 + 2e-7f ) );
			}
			Assert.Equal( 0f, FMath.FastSqrtPrecise( 0 ) );
			Assert.Equal( 0f, FMath.FastSqrtPrecise( -1 ) );
		}

		[Fact]
		public void ThePreciseTrigonometryIsGoodToAFloatsPrecision()
		{
			float sin = 0, cos = 0, acos = 0;
			for ( float x = -2 * MathF.PI; x <= 2 * MathF.PI; x += 0.001f )
			{
				sin = MathF.Max( sin, MathF.Abs( FMath.FastSinPrecise( x ) - MathF.Sin( x ) ) );
				cos = MathF.Max( cos, MathF.Abs( FMath.FastCosPrecise( x ) - MathF.Cos( x ) ) );
			}
			for ( float x = -1; x <= 1; x += 0.0001f )
			{
				acos = MathF.Max( acos, MathF.Abs( FMath.FastAcosPrecise( x ) - MathF.Acos( x ) ) );
			}
			Assert.InRange( sin, 0, 5e-7f );
			Assert.InRange( cos, 0, 5e-7f );
			Assert.InRange( acos, 0, 5e-7f );
			Assert.Equal( 0f, FMath.FastAcosPrecise( 1.5f ) );
			Assert.Equal( MathF.PI, FMath.FastAcosPrecise( -1.5f ), 6 );
			Assert.Equal( MathF.Asin( 0.3f ), FMath.FastAsinPrecise( 0.3f ), 6 );

			Vector<float> angles = Floats( -5, -0.25f, 1, 4 );
			Close( Floats( MathF.Sin( -5 ), MathF.Sin( -0.25f ), MathF.Sin( 1 ), MathF.Sin( 4 ) ), FMathWide.Lanes.Sin( angles ), 1e-6f );
			Close( Floats( MathF.Cos( -5 ), MathF.Cos( -0.25f ), MathF.Cos( 1 ), MathF.Cos( 4 ) ), FMathWide.Lanes.Cos( angles ), 1e-6f );
			Close( Floats( MathF.Acos( -0.9f ), MathF.Acos( 0 ), MathF.Acos( 0.5f ), 0 ), FMathWide.Lanes.Acos( Floats( -0.9f, 0, 0.5f, 1 ) ), 1e-6f );
			Assert.Equal( Floats( float.PositiveInfinity, float.PositiveInfinity, 0.5f, 0.25f ), FMathWide.Lanes.ReciprocalSqrt( Floats( 0, -1, 4, 16 ) ) );
			Assert.Equal( Floats( 1e9f, -1e9f, 3, -4 ), FMathWide.Lanes.Floor( Floats( 1e9f, -1e9f, 3.5f, -3.5f ) ) );
		}

		[Fact]
		public void TheWideCallsAreVectorsOwnWithSimdAndFastMathsLanesWithout()
		{
			bool simd = FMathWide.UsesSimd;
#if CSE_NO_SIMD
			Assert.False( simd );
#else
			Assert.True( simd );
#endif
			Vector<float> a = Floats( -3.5f, 0, 2.25f, 16 );
			Vector<float> b = Floats( 1, -0.5f, 2.25f, -1 );
			Vector<float> positive = Vector.Abs( b );
			Vector<int> c = Ints( 1, -2 );
			Vector<int> d = Ints( 0, 5 );
			Assert.Equal( simd ? Vector.Max( a, b ) : FMathWide.Lanes.Max( a, b ), FMathWide.Max( a, b ) );
			Assert.Equal( simd ? Vector.Min( a, b ) : FMathWide.Lanes.Min( a, b ), FMathWide.Min( a, b ) );
			Assert.Equal( simd ? Vector.Abs( a ) : FMathWide.Lanes.Abs( a ), FMathWide.Abs( a ) );
			Assert.Equal( simd ? Vector.Floor( a ) : FMathWide.Lanes.Floor( a ), FMathWide.Floor( a ) );
			Assert.Equal( simd ? Vector.SquareRoot( positive ) : FMathWide.Lanes.Sqrt( positive ), FMathWide.Sqrt( positive ) );
			Assert.Equal( simd ? Vector<float>.One / b : FMathWide.Lanes.Reciprocal( b ), FMathWide.Reciprocal( b ) );
			Assert.Equal( simd ? Vector<float>.One / Vector.SquareRoot( positive ) : FMathWide.Lanes.ReciprocalSqrt( positive ), FMathWide.ReciprocalSqrt( positive ) );
			Assert.Equal( simd ? Vector.Max( c, d ) : FMathWide.Lanes.Max( c, d ), FMathWide.Max( c, d ) );
			Assert.Equal( simd ? Vector.Min( c, d ) : FMathWide.Lanes.Min( c, d ), FMathWide.Min( c, d ) );
			Assert.Equal( simd ? Vector.Abs( c ) : FMathWide.Lanes.Abs( c ), FMathWide.Abs( c ) );
		}
	}
}