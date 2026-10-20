// Created by Anton Piruev in 2026.
// Any direct commercial use of derivative work is strictly prohibited.

/**
 * GLSL pieces every SDF shader shares (Babylon's GLSL dialect, WebGL2): the
 * edit shapes and operations - the same formulas as Field/Shapes.ts and
 * Field/Ops.ts, so the GPU and the CPU agree - the dynamic edits applied on
 * top of a distance, the sampled volume, analytic sphere occluders and the
 * sun's shadow map. Declarations and functions come apart: a material plugin
 * declares its uniforms in its own uniform buffer, a shader material as plain
 * uniforms.
 */

/** Dynamic edits: five vec4s each (SdfDynamicEdits' packing). */
export const DynamicDeclarations = /* glsl */ `
uniform vec4 sdfDynamic[80];
uniform float sdfDynamicCount;
// 1 when an edit's mask leaves a layer out (the layers must be followed)
uniform float sdfDynamicLayered;
#ifdef DYNAMIC_MASK
// the edits this draw needs, a bit each (a proxy: the ones reaching it)
uniform int sdfDynamicMask;
#endif
// the edits the current ray or point can meet, a bit each: a ray marcher
// narrows it once per ray (cseSdfRayEdits), so its steps skip the rest
int cseEdits = 65535;
`;

/**
 * The volume: the world's distance sampled into a 3D texture - dense, or
 * with SDF_BRICKS a brick map and its atlas (SdfBrickTexture).
 */
export const VolumeDeclarations = /* glsl */ `
uniform vec3 sdfBoundsMin;
uniform vec3 sdfBoundsSize;
uniform vec3 sdfVolumeSize;
uniform float sdfRange;
#ifdef SDF_BRICKS
// the map's window: its lowest cell (world cells), a cell's size, and
// cells along its edge
uniform vec4 sdfBrickInfo;
uniform float sdfBrickMapSize;
#endif
`;

/** Spheres that stand for meshes in the SDF's occlusion: center, radius. */
export const OccluderDeclarations = /* glsl */ `
uniform vec4 sdfOccluders[16];
uniform float sdfOccluderCount;
`;

/** The sun's shadow map (a depth texture compared in hardware). */
export const ShadowMapDeclarations = /* glsl */ `
uniform mat4 sdfLightMatrix;
// size, 1 / size, darkness, normal offset
uniform vec4 sdfShadowInfo;
`;

export const ShadowMapSampler = /* glsl */ `
uniform highp sampler2DShadow sdfShadowMap;
`;

export const VolumeSampler = /* glsl */ `
uniform highp sampler3D sdfVolume;
uniform highp sampler3D sdfVolumeMaterials;
#ifdef SDF_BRICKS
uniform highp sampler3D sdfBrickMap;
#endif
`;

/** Shapes and operations (SdfShape and SdfOp numbering). */
export const ShapeFunctions = /* glsl */ `
float cseSdfShape( int shape, vec4 p, vec3 x ) {
	if ( shape == 0 ) {
		return length( x ) - p.x;
	}
	if ( shape == 1 || shape == 2 ) {
		float r = shape == 2 ? p.w : 0.0;
		vec3 q = abs( x ) - p.xyz + r;

		return length( max( q, 0.0 ) ) + min( max( q.x, max( q.y, q.z ) ), 0.0 )
			- r;
	}
	if ( shape == 3 ) {
		float along = clamp( x.y, -p.x, p.x );

		return length( vec3( x.x, x.y - along, x.z ) ) - p.y;
	}
	if ( shape == 4 ) {
		return length( vec2( length( x.xz ) - p.x, x.y ) ) - p.y;
	}
	if ( shape == 5 ) {
		vec2 d = vec2( length( x.xz ) - p.y, abs( x.y ) - p.x );

		return min( max( d.x, d.y ), 0.0 ) + length( max( d, 0.0 ) );
	}
	if ( shape == 7 ) {
		// a segment of two radii: from its -Y end, in the axis' plane
		float h = 2.0 * p.x;
		vec2 q = vec2( length( x.xz ), x.y + p.x );
		float b = h > 0.0 ? ( p.y - p.z ) / h : ( p.y >= p.z ? 1.0 : -1.0 );

		if ( b >= 1.0 ) {
			return length( q ) - p.y;
		}
		if ( b <= -1.0 ) {
			return length( q - vec2( 0.0, h ) ) - p.z;
		}

		float a = sqrt( 1.0 - b * b );
		float k = dot( q, vec2( -b, a ) );

		if ( k < 0.0 ) {
			return length( q ) - p.y;
		}
		if ( k > a * h ) {
			return length( q - vec2( 0.0, h ) ) - p.z;
		}
		return dot( q, vec2( a, b ) ) - p.y;
	}

	float k0 = length( x / p.xyz );
	float k1 = length( x / ( p.xyz * p.xyz ) );

	return k1 > 0.0 ? k0 * ( k0 - 1.0 ) / k1 : -min( p.x, min( p.y, p.z ) );
}

// a sphere around the shape's center holding all of it, local units (as
// Field/Shapes.ts ShapeRadius)
float cseSdfShapeRadius( int shape, vec4 p ) {
	if ( shape == 0 ) {
		return p.x;
	}
	if ( shape == 1 || shape == 2 ) {
		return length( p.xyz );
	}
	if ( shape == 3 || shape == 4 ) {
		return p.x + p.y;
	}
	if ( shape == 5 ) {
		return length( p.xy );
	}
	if ( shape == 7 ) {
		return p.x + max( p.y, p.z );
	}
	return max( p.x, max( p.y, p.z ) );
}

float cseSdfSmoothMin( float a, float b, float k ) {
	float gap = abs( a - b );

	if ( !( gap < k ) ) {
		return min( a, b );
	}

	float h = ( k - gap ) / k;

	return min( a, b ) - h * h * k * 0.25;
}

float cseSdfOp( int op, float scene, float edit, float k ) {
	if ( op == 0 ) {
		return min( scene, edit );
	}
	if ( op == 1 ) {
		return max( scene, -edit );
	}
	if ( op == 2 ) {
		return max( scene, edit );
	}
	if ( op == 3 ) {
		return cseSdfSmoothMin( scene, edit, k );
	}
	if ( op == 4 ) {
		return -cseSdfSmoothMin( -scene, edit, k );
	}
	return -cseSdfSmoothMin( -scene, -edit, k );
}

// v rotated by the conjugate of q (into the edit's frame)
vec3 cseSdfUnrotate( vec4 q, vec3 v ) {
	vec3 u = -q.xyz;
	vec3 t = 2.0 * cross( u, v );

	return v + q.w * t + cross( u, t );
}
`;

/**
 * The dynamic edits applied to a distance `d` at `p`, in their order, as
 * FieldState applies edits: `layer` is the layer (an index) of the surface
 * there - an edit merges with it, or cuts it, only if its mask has that
 * layer; elsewhere a union meets it with a hard seam and a cut leaves it
 * alone. Where an edit shows, `color` fades towards its material's
 * (DYNAMIC_COLOR: with the palette), and the surface becomes its layer's.
 */
export const DynamicFunctions = /* glsl */ `
float cseSdfDynamic( vec3 p, float d, inout float layer, inout vec3 color ) {
	for ( int i = 0; i < 16; i++ ) {
		if ( float( i ) >= sdfDynamicCount ) {
			break;
		}
		if ( ( cseEdits & ( 1 << i ) ) == 0 ) {
			continue;
		}

		vec4 pose = sdfDynamic[i * 5];
		vec4 params = sdfDynamic[i * 5 + 2];
		vec4 kind = sdfDynamic[i * 5 + 3];
		vec4 layers = sdfDynamic[i * 5 + 4];
		int op = int( kind.x + 0.5 );
		int shape = int( kind.y + 0.5 );
		float k = kind.z;
		bool adds = op == 0 || op == 3;
		// the least the edit's distance can be here (its shape lies inside
		// this sphere): far enough, a union or a subtraction changes nothing
		// - nor wins the material - and the shape isn't evaluated
		float least = length( p - pose.xyz )
			- cseSdfShapeRadius( shape, params ) * pose.w - k;

		if ( adds ? least > d : ( op == 1 || op == 4 ) && least > -d ) {
			continue;
		}

		int maskBits = int( layers.y + 0.5 );

		// the surface's layer, looked up only when a mask needs it
		if ( maskBits != 255 && layer < 0.0 ) {
#ifdef SDF_LAYER_LOOKUP
			layer = cseSdfVolumeMaterial( p ).w;
#else
			layer = 0.0;
#endif
		}

		bool merges = maskBits == 255
			|| ( maskBits & ( 1 << int( max( layer, 0.0 ) + 0.5 ) ) ) != 0;

		// a cut reaches only its mask's layers
		if ( !adds && !merges ) {
			continue;
		}

		vec4 rotation = sdfDynamic[i * 5 + 1];
		vec3 local = cseSdfUnrotate( rotation, p - pose.xyz ) / pose.w;
		float e = cseSdfShape( shape, params, local ) * pose.w;
		bool blends = ( op >= 3 ) && k > 0.0 && merges;
		// what the surface is met or cut with
		float other = adds ? e : op == 1 || op == 4 ? -e : e;
		float w;

		if ( adds ) {
			if ( blends ) {
				w = clamp( 0.5 + 0.5 * ( d - e ) / k, 0.0, 1.0 );
				d = cseSdfSmoothMin( d, e, k );
			} else {
				w = e < d ? 1.0 : 0.0;
				d = min( d, e );
			}
		} else if ( blends ) {
			w = clamp( 0.5 + 0.5 * ( other - d ) / k, 0.0, 1.0 );
			d = -cseSdfSmoothMin( -d, -other, k );
		} else {
			w = other > d ? 1.0 : 0.0;
			d = max( d, other );
		}
#ifdef DYNAMIC_COLOR
		color = mix( color, palette[int( kind.w + 0.5 ) & 7], w );
#endif
		if ( adds && w > 0.5 ) {
			layer = float( int( log2( layers.x + 0.5 ) ) );
		}
	}
	return d;
}

// the reach of edit i: its center, and the radius it changes the world within
vec4 cseSdfEditSphere( int i ) {
	vec4 pose = sdfDynamic[i * 5];
	vec4 params = sdfDynamic[i * 5 + 2];
	vec4 kind = sdfDynamic[i * 5 + 3];

	return vec4( pose.xyz,
		cseSdfShapeRadius( int( kind.y + 0.5 ), params ) * pose.w + kind.z );
}

// the edits a ray can meet between t0 and t1 (grown by margin): the ones
// whose reach it crosses; an intersection reaches everywhere
int cseSdfRayEdits( vec3 ro, vec3 rd, float t0, float t1, float margin ) {
	int edits = 0;

	for ( int i = 0; i < 16; i++ ) {
		if ( float( i ) >= sdfDynamicCount ) {
			break;
		}

		vec4 sphere = cseSdfEditSphere( i );
		int op = int( sdfDynamic[i * 5 + 3].x + 0.5 );
		float r = sphere.w + margin;
		vec3 oc = ro - sphere.xyz;
		float b = dot( oc, rd );
		float disc = b * b - ( dot( oc, oc ) - r * r );

		if ( op == 2 || op == 5 || disc >= 0.0
			&& -b + sqrt( disc ) >= t0 && -b - sqrt( disc ) <= t1 ) {
			edits |= 1 << i;
		}
	}
	return edits;
}

// the edits within margin of a point
int cseSdfPointEdits( vec3 p, float margin ) {
	int edits = 0;

	for ( int i = 0; i < 16; i++ ) {
		if ( float( i ) >= sdfDynamicCount ) {
			break;
		}

		vec4 sphere = cseSdfEditSphere( i );
		int op = int( sdfDynamic[i * 5 + 3].x + 0.5 );

		if ( op == 2 || op == 5
			|| length( p - sphere.xyz ) <= sphere.w + margin ) {
			edits |= 1 << i;
		}
	}
	return edits;
}

// the distance alone, with every edit merging with everything (no layers,
// no colours): what a march's steps take while no mask leaves a layer out
float cseSdfDynamicPlain( vec3 p, float d ) {
	for ( int i = 0; i < 16; i++ ) {
		if ( float( i ) >= sdfDynamicCount ) {
			break;
		}
		if ( ( cseEdits & ( 1 << i ) ) == 0 ) {
			continue;
		}

		vec4 pose = sdfDynamic[i * 5];
		vec4 params = sdfDynamic[i * 5 + 2];
		vec4 kind = sdfDynamic[i * 5 + 3];
		int op = int( kind.x + 0.5 );
		int shape = int( kind.y + 0.5 );
		float k = kind.z;
		bool adds = op == 0 || op == 3;
		float least = length( p - pose.xyz )
			- cseSdfShapeRadius( shape, params ) * pose.w - k;

		if ( adds ? least > d : ( op == 1 || op == 4 ) && least > -d ) {
			continue;
		}

		vec3 local = cseSdfUnrotate( sdfDynamic[i * 5 + 1], p - pose.xyz )
			/ pose.w;
		float e = cseSdfShape( shape, params, local ) * pose.w;
		float other = op == 1 || op == 4 ? -e : e;

		if ( op >= 3 && k > 0.0 ) {
			d = adds
				? cseSdfSmoothMin( d, e, k )
				: -cseSdfSmoothMin( -d, -other, k );
		} else {
			d = adds ? min( d, e ) : max( d, other );
		}
	}
	return d;
}

// the distance alone (the surface's layer looked up if needed)
float cseSdfDynamicDistance( vec3 p, float d ) {
	if ( sdfDynamicLayered < 0.5 ) {
		return cseSdfDynamicPlain( p, d );
	}

	float layer = -1.0;
	vec3 color = vec3( 0.0 );

	return cseSdfDynamic( p, d, layer, color );
}
`;

/**
 * Where a formula's GLSL (FormulaGlsl) goes into a shader that reads one
 * (SDF_FORMULA): the shader is stored under a name of its own per formula.
 */
export const FormulaMarker = "//#CSE_FORMULA";

/**
 * The volume's distance; outside its box at least the distance to the box
 * (the texture clamps at its edge).
 */
export const VolumeFunctions = /* glsl */ `
// how fine the field is read (world units): a formula leaves out what is
// finer (the march sets it from the pixel's cone)
float cseSdfDetail = 0.0;
#ifdef SDF_FORMULA
${ FormulaMarker }

float cseSdfVolume( vec3 p ) {
	return cseSdfFormula( p, cseSdfDetail );
}
#elif defined( SDF_BRICKS )
// the map's cell at p, toroidal (its texel: a brick's slot with alpha
// 255, a solid cell's 254, an empty one's distance in cells to one that
// isn't); false outside the window
bool cseSdfBrickCell( vec3 p, out vec3 cell, out vec4 texel ) {
	cell = floor( p / sdfBrickInfo.w );

	vec3 local = cell - sdfBrickInfo.xyz;

	if ( any( lessThan( local, vec3( 0.0 ) ) )
		|| any( greaterThanEqual( local, vec3( sdfBrickMapSize ) ) ) ) {
		return false;
	}
	texel = texelFetch(
		sdfBrickMap,
		ivec3( mod( cell, sdfBrickMapSize ) ),
		0
	) * 255.0;
	return true;
}

// where p falls in its brick's slot of the atlas (texels): node n of an
// axis sits at texel n + 1 of the slot's ten
vec3 cseSdfBrickTexel( vec3 p, vec3 cell, vec4 texel ) {
	vec3 node = ( p - cell * sdfBrickInfo.w ) / ( sdfBrickInfo.w / 8.0 );

	return floor( texel.xyz + 0.5 ) * 10.0 + 1.0 + node;
}

// as the dense volume: read at the nearest point of the box (the bounds:
// what lies beyond isn't the world drawn), at least as far as the box
float cseSdfVolume( vec3 p ) {
	vec3 q = clamp( p, sdfBoundsMin, sdfBoundsMin + sdfBoundsSize );
	float outside = length( p - q );
	vec3 cell;
	vec4 texel;
	float d;

	if ( !cseSdfBrickCell( q, cell, texel ) ) {
		// outside the window nothing is known
		d = sdfRange;
	} else if ( texel.a > 254.5 ) {
		vec3 uvw = ( cseSdfBrickTexel( q, cell, texel ) + 0.5 )
			/ vec3( textureSize( sdfVolume, 0 ) );

		d = ( texture( sdfVolume, uvw ).r - 0.5 ) * 2.0 * sdfRange;
	} else if ( texel.a > 253.5 ) {
		d = -sdfRange;
	} else {
		// empty: the surface lies in a brick k cells away at the nearest
		d = max( sdfRange, ( floor( texel.a + 0.5 ) - 1.0 ) * sdfBrickInfo.w );
	}
	return outside > 0.0 ? max( d, outside ) : d;
}
#else
float cseSdfVolume( vec3 p ) {
	vec3 uvw = ( p - sdfBoundsMin ) / sdfBoundsSize;
	float d = ( texture( sdfVolume, uvw ).r - 0.5 ) * 2.0 * sdfRange;
	float outside = length( max(
		max( sdfBoundsMin - p, p - sdfBoundsMin - sdfBoundsSize ),
		0.0
	) );

	// inside the box the texel's distance, negative in a solid too
	return outside > 0.0 ? max( d, outside ) : d;
}
#endif

// a texel of the materials: first and second id, the second's share, the layer
vec4 cseSdfDecodeTexel( vec4 texel ) {
	float packed = floor( texel.b * 255.0 + 0.5 );

	return vec4(
		floor( texel.r * 255.0 + 0.5 ),
		floor( texel.g * 255.0 + 0.5 ),
		floor( packed / 8.0 ) / 31.0,
		mod( packed, 8.0 )
	);
}

// the texel at p: its material pair, the second's share and the layer
#ifdef SDF_FORMULA
// a formula's: the orbit trap fading between the frame's two materials
vec4 cseSdfVolumeMaterial( vec3 p ) {
	cseSdfFormula( p, cseSdfDetail );
	return vec4( sdfFormulaFrame[2].zw, cseFormulaMix, 0.0 );
}
#elif defined( SDF_BRICKS )
vec4 cseSdfVolumeMaterial( vec3 p ) {
	vec3 cell;
	vec4 texel;

	// only bricks know materials (a hit lies in one)
	if ( !cseSdfBrickCell( p, cell, texel ) || texel.a < 254.5 ) {
		return vec4( 0.0 );
	}

	ivec3 at = ivec3( floor( cseSdfBrickTexel( p, cell, texel ) + 0.5 ) );

	return cseSdfDecodeTexel( texelFetch( sdfVolumeMaterials, at, 0 ) );
}
#else
vec4 cseSdfVolumeMaterial( vec3 p ) {
	vec3 uvw = clamp( ( p - sdfBoundsMin ) / sdfBoundsSize, 0.0, 0.9999 );

	ivec3 texel = ivec3( uvw * sdfVolumeSize );

	return cseSdfDecodeTexel( texelFetch( sdfVolumeMaterials, texel, 0 ) );
}
#endif

`;

/**
 * How much of the sky the spheres leave a point with normal `n`: each blocks
 * the cosine-weighted share of the sky it covers, (r / l)^2 cos.
 */
export const OccluderFunctions = /* glsl */ `
float cseSdfOccluders( vec3 p, vec3 n ) {
	float visible = 1.0;

	for ( int i = 0; i < 16; i++ ) {
		if ( float( i ) >= sdfOccluderCount ) {
			break;
		}

		vec4 sphere = sdfOccluders[i];
		vec3 to = sphere.xyz - p;
		float l2 = max( dot( to, to ), 1e-6 );
		float r2 = sphere.w * sphere.w;

		// four radii away a sphere blocks under a sixteenth: skipped
		if ( l2 < 16.0 * r2 ) {
			float cosine = dot( n, to ) * inversesqrt( l2 );

			// never all of it: inside the sphere stands the mesh, not a
			// solid ball
			visible *= 1.0 - min( max( cosine, 0.0 ) * r2 / l2, 0.8 );
		}
	}
	return visible;
}
`;

/**
 * The sun's shadow map at `p`: 1 lit, the generator's darkness in shadow;
 * four hardware-compared taps half a texel apart.
 */
export const ShadowMapFunctions = /* glsl */ `
float cseSdfShadowMap( vec3 p ) {
	vec4 clip = sdfLightMatrix * vec4( p, 1.0 );
	vec3 uvDepth = 0.5 * clip.xyz / clip.w + 0.5;

	if ( uvDepth.x < 0.0 || uvDepth.x > 1.0 || uvDepth.y < 0.0
		|| uvDepth.y > 1.0 || uvDepth.z > 1.0 ) {
		return 1.0;
	}

	float z = clamp( uvDepth.z, 0.0, 0.99999994 );
	float o = 0.5 * sdfShadowInfo.y;
	float lit = texture( sdfShadowMap, vec3( uvDepth.xy + vec2( -o, -o ), z ) )
		+ texture( sdfShadowMap, vec3( uvDepth.xy + vec2( o, -o ), z ) )
		+ texture( sdfShadowMap, vec3( uvDepth.xy + vec2( -o, o ), z ) )
		+ texture( sdfShadowMap, vec3( uvDepth.xy + vec2( o, o ), z ) );

	return mix( sdfShadowInfo.z, 1.0, lit * 0.25 );
}
`;
