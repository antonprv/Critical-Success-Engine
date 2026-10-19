// Created by Anton Piruev in 2026.
// Any direct commercial use of derivative work is strictly prohibited.

import {
	DynamicDeclarations,
	DynamicFunctions,
	OccluderDeclarations,
	OccluderFunctions,
	ShadowMapDeclarations,
	ShadowMapFunctions,
	ShadowMapSampler,
	ShapeFunctions,
	VolumeDeclarations,
	VolumeFunctions,
	VolumeSampler,
} from "./SdfGlsl";

/**
 * The ray marcher of the sampled SDF volume (plan.md 3.1 way A, 8.1 variant
 * 1): drawn on the back faces of a box, it marches the 3D texture - with the
 * dynamic edits applied on top - from where the ray enters the box, lights
 * the hit in the same pass (forward, plan.md 21.1) and writes its depth, so
 * Babylon's own depth test puts meshes in front of and behind it.
 *
 * One source, three uses by its defines:
 * - none: the whole volume (tier B);
 * - PROXY: only where the dynamic edits change the world, over the mesh tier
 *   (the chunks cut those places out, SdfMaterialPlugin);
 * - CASTER: the shadow map's pass, marched along the sun's rays (Babylon's
 *   ShadowGenerator sets the SM_* defines and uniforms);
 * - CONE_PASS: a level of the cone march (SdfConeMarch), a cone a texel;
 *   CONE_START starts the rays where the level before it left off;
 * - CHECKER_PASS: this frame's half of the pixel grid's corners, a texel
 *   each (SdfCheckerboard, plan.md 21.7); CHECKER_RESOLVE: the pixels on
 *   screen from them and the previous frame's other half.
 * SHADOWMAP adds the sun's shadow map (the meshes' shadows), OCCLUDERS the
 * spheres that stand for meshes in the occlusion.
 *
 * Written in Babylon's GLSL dialect; it needs WebGL2 (sampler3D, texelFetch,
 * gl_FragDepth in the core).
 */

/** Shader store name (Babylon looks up `${name}VertexShader` etc.). */
export const RaymarchShaderName = "cseSdfRaymarch";

export const RaymarchVertex = /* glsl */ `
precision highp float;

attribute vec3 position;

#include<instancesDeclaration>
uniform mat4 viewProjection;

varying vec3 vWorld;
#ifdef PROXY_INSTANCED
// all the hulls in one draw: each instance's sphere and edits
attribute vec4 proxySphereInstance;
attribute float proxyMaskInstance;
varying vec4 vProxySphere;
varying float vProxyMask;
#endif
// passes that grow what they draw as seen: a cone level's hulls, and the
// checkerboard's corners (hulls and the box)
#if defined( CONE_PASS ) && defined( PROXY_INSTANCED )
#define GROWN_HULL
#endif
#ifdef CHECKER_PASS
#define GROWN
#ifdef PROXY_INSTANCED
#define GROWN_HULL
#endif
#endif
#ifdef GROWN_HULL
#define GROWN
#endif
#ifdef GROWN
uniform vec3 cameraPosition;
uniform float pixelAngle;
#endif

void main( void ) {
#include<instancesVertex>
	vec4 worldPos = finalWorld * vec4( position, 1.0 );

#ifdef GROWN_HULL
	// a hull grown by a texel and a half as seen - of a cone level: it
	// covers every texel a pixel or a finer texel of it reads, so a texel's
	// start is never another hull's alone (the nearest of them all is kept);
	// of the screen for the checkerboard: the corner a texel marches lies up
	// to a pixel off where it rasterizes
	{
		vec3 c = proxySphereInstance.xyz;
		float r = proxySphereInstance.w;
		float grow = distance( cameraPosition, c ) * pixelAngle * 1.5;

		worldPos.xyz = c + ( worldPos.xyz - c ) * ( r + grow ) / r;
	}
#elif defined( CHECKER_PASS )
	// a box grown by a couple of pixels as seen, away from its center: the
	// corners near its outline rasterize too
	{
		vec3 away = worldPos.xyz - finalWorld[3].xyz;

		worldPos.xyz += normalize( away )
			* distance( cameraPosition, worldPos.xyz ) * pixelAngle * 2.5;
	}
#endif
	vWorld = worldPos.xyz;
#ifdef PROXY_INSTANCED
	vProxySphere = proxySphereInstance;
	vProxyMask = proxyMaskInstance;
#endif
	gl_Position = viewProjection * worldPos;
#ifdef CASTER
	// the box's faces may lie on the light's near or far plane (its depth
	// range is fitted to the casters, this box among them) and be clipped;
	// the depth is the hit's, written by the fragment
	gl_Position.z = 0.0;
#endif
}
`;

export const RaymarchFragment = /* glsl */ `
precision highp float;
precision highp sampler3D;
precision highp sampler2DShadow;

varying vec3 vWorld;

${ VolumeSampler }
${ VolumeDeclarations }
${ DynamicDeclarations }
#ifdef OCCLUDERS
${ OccluderDeclarations }
#endif
#ifdef SHADOWMAP
${ ShadowMapSampler }
${ ShadowMapDeclarations }
#endif
#ifdef CASTER
uniform vec3 biasAndScaleSM;
uniform vec2 depthValuesSM;
uniform vec3 lightDataSM;
#endif
#ifdef CASTER_CACHED
// the box's shadow as the cache keeps it, in the map's texels (the depth,
// the map's colour), and whether it holds it as the map is now
uniform sampler2D casterCache;
uniform float casterCached;
#endif

uniform mat4 viewProjection;
uniform vec3 cameraPosition;
// the box marched: the volume's, or a proxy's
uniform vec3 marchMin;
uniform vec3 marchMax;
// how far a pixel spans per unit of distance (tan(fov / 2) * 2 / height)
uniform float pixelAngle;
uniform float stepScale;
uniform vec3 sunDirection;
uniform vec3 sunColor;
uniform vec3 skyDirection;
uniform vec3 skyColor;
uniform vec3 groundColor;
uniform vec3 palette[8];
// 0 lit, 1 normals, 2 step count, 3 distance bands
uniform float debugMode;
// 0 plain, 1 ambient occlusion, 2 also soft shadows
uniform float quality;
// PROXY: how much the dynamic edits must move the surface to be drawn
uniform float proxyThreshold;
// PROXY: the sphere the dynamic edits change the world within, and the
// edits it marches - of the draw, or (PROXY_INSTANCED) of the instance
#ifdef PROXY_INSTANCED
varying vec4 vProxySphere;
varying float vProxyMask;
#define PROXY_SPHERE vProxySphere
#define PROXY_MASK int( vProxyMask + 0.5 )
#else
uniform vec4 proxySphere;
#define PROXY_SPHERE proxySphere
#define PROXY_MASK sdfDynamicMask
#endif
#if defined( CHECKER_PASS ) || defined( CHECKER_RESOLVE )
// which half of the pixel grid's corners this frame marched (the corners
// whose x + y + parity is even); the screen in pixels; the camera's inverse
// view-projection (a corner's ray)
uniform float checkerParity;
uniform vec2 screenSize;
uniform mat4 inverseViewProjection;
#endif
#ifdef CHECKER_RESOLVE
// this frame's corners and the previous frame's (the colour, and how far
// along the corner's ray; 0: nothing there), whether there is a previous
// frame, and its camera
uniform sampler2D checkerCurrent;
uniform sampler2D checkerPrevious;
uniform float checkerHistory;
uniform mat4 previousViewProjection;
uniform mat4 previousInverse;
uniform vec3 previousCamera;
#endif
#ifdef CONE_START
// how far along the rays the level before saw nothing (0: unknown), its
// texels per pixel of this pass, its cones' radius per unit of distance
uniform sampler2D coneStart;
uniform vec2 coneStartScale;
uniform float coneStartTan;
#endif
#ifdef LIGHT_START
// the soft shadows and occlusion at a lower resolution (shadow, occlusion,
// how far along the texel's ray; 0: nothing there), its texels per pixel
uniform sampler2D lightBuffer;
uniform vec2 lightBufferScale;
#endif
#ifdef CONE_PASS
// a cone's radius per unit of distance, in texels (RaymarchMaterial)
const float CONE_SPREAD = 1.5;
const int CONE_STEPS = 64;
#endif

const int MAX_STEPS = 160;



#define SDF_LAYER_LOOKUP
#define DYNAMIC_COLOR
${ ShapeFunctions }
${ VolumeFunctions }
${ DynamicFunctions }
#ifdef OCCLUDERS
${ OccluderFunctions }
#endif
#ifdef SHADOWMAP
${ ShadowMapFunctions }
#endif

float Distance( vec3 p ) {
	return cseSdfDynamicDistance( p, cseSdfVolume( p ) );
}

// a texel's colour: its two materials faded by its mix
vec3 PaletteOf( vec4 material ) {
	return mix(
		palette[int( material.x ) & 7],
		palette[int( material.y ) & 7],
		material.z
	);
}

// the colour at p from the eight texels around it, weighed as the hardware
// weighs distances: materials fade over a texel even at a hard seam
vec3 VolumeColor( vec3 p ) {
#ifdef PROXY
	// a hull's pixels are the dearest: the nearest texel's colour
	return PaletteOf( cseSdfVolumeMaterial( p ) );
#else
#ifdef SDF_BRICKS
	// the brick's eight nodes around p (its apron keeps them in its slot);
	// out of the bricks only material 0
	vec3 cell;
	vec4 texel;

	if ( !cseSdfBrickCell( p, cell, texel ) || texel.a < 254.5 ) {
		return PaletteOf( vec4( 0.0 ) );
	}

	vec3 f = cseSdfBrickTexel( p, cell, texel );
	ivec3 hi = textureSize( sdfVolumeMaterials, 0 ) - 1;
#else
	vec3 f = ( p - sdfBoundsMin ) / sdfBoundsSize * sdfVolumeSize - 0.5;
	ivec3 hi = ivec3( sdfVolumeSize ) - 1;
#endif
	vec3 i0 = floor( f );
	vec3 t = f - i0;
	vec3 color = vec3( 0.0 );

	for ( int z = 0; z < 2; z++ ) {
		for ( int y = 0; y < 2; y++ ) {
			for ( int x = 0; x < 2; x++ ) {
				ivec3 q = clamp(
					ivec3( i0 ) + ivec3( x, y, z ),
					ivec3( 0 ),
					hi
				);
				vec3 w = mix( 1.0 - t, t, vec3( x, y, z ) );

				color += w.x * w.y * w.z
					* PaletteOf( cseSdfDecodeTexel(
						texelFetch( sdfVolumeMaterials, q, 0 )
					) );
			}
		}
	}
	return color;
#endif
}

vec3 Normal( vec3 p, float e ) {
	vec2 k = vec2( 1.0, -1.0 );

	return normalize(
		k.xyy * Distance( p + k.xyy * e )
		+ k.yyx * Distance( p + k.yyx * e )
		+ k.yxy * Distance( p + k.yxy * e )
		+ k.xxx * Distance( p + k.xxx * e )
	);
}

// where a ray enters and leaves the marched box grown by this much (x > y:
// it misses)
vec2 BoxHit( vec3 ro, vec3 rd, float grow ) {
	vec3 inv = 1.0 / rd;
	vec3 t0 = ( marchMin - grow - ro ) * inv;
	vec3 t1 = ( marchMax + grow - ro ) * inv;
	vec3 lo = min( t0, t1 );
	vec3 hi = max( t0, t1 );

	return vec2(
		max( max( lo.x, lo.y ), lo.z ),
		min( min( hi.x, hi.y ), hi.z )
	);
}

#ifdef PROXY
// a proxy's few pixels are the dearest: two probes, not five
const int OCCLUSION_PROBES = 2;
const float OCCLUSION_WEIGHTS = 1.5;
#else
const int OCCLUSION_PROBES = 5;
const float OCCLUSION_WEIGHTS = 1.9375;
#endif

float Occlusion( vec3 p, vec3 n, float h ) {
	float occlusion = 0.0;
	float weight = 1.0;

	for ( int i = 1; i <= OCCLUSION_PROBES; i++ ) {
		float t = h * float( i );

		float d = Distance( p + n * t );

		occlusion += weight * clamp( ( t - d ) / t, 0.0, 1.0 );
		weight *= 0.5;
	}
	return 1.0 - occlusion / OCCLUSION_WEIGHTS;
}

// the dynamic edits this draw may meet at all (a proxy: its own)
int baseEdits = 65535;

// penumbra by the closest miss along a ray to the sun (k d / t)
float Shadow( vec3 p, vec3 l, float start, float far ) {
	float light = 1.0;
	float t = start;

#ifndef DYNAMIC_MASK
	cseEdits = baseEdits & cseSdfRayEdits( p, l, start, far, start );
#endif

	for ( int i = 0; i < 48; i++ ) {
		float d = Distance( p + l * t );

		// a distance near the edge of the encoded range only says "at least
		// this far" (filtered bytes fall just short of it): no penumbra
		// from it, else open ground far below the top of the volume darkens
		if ( d < sdfRange * 0.9 ) {
			light = min( light, 8.0 * d / t );
		}
		t += clamp( d, start * 0.5, sdfRange );
		if ( light < 0.01 || t > far ) {
			break;
		}
	}
	light = clamp( light, 0.0, 1.0 );
	return light * light * ( 3.0 - 2.0 * light );
}

#ifdef LIGHT_START
// the shadow and occlusion at a point of the screen (pixels) t along its
// ray, from the buffer's four nearest texels that saw the same surface (as
// far along their rays), weighed by nearness; false where none did
bool LightFrom( vec2 pixel, float t, float tolerance, out vec2 light ) {
	vec2 at = pixel * lightBufferScale - 0.5;
	vec2 base = floor( at );
	vec2 f = at - base;
	ivec2 last = textureSize( lightBuffer, 0 ) - 1;
	vec3 sum = vec3( 0.0 );

	for ( int j = 0; j < 2; j++ ) {
		for ( int i = 0; i < 2; i++ ) {
			vec4 s = texelFetch(
				lightBuffer,
				clamp( ivec2( base ) + ivec2( i, j ), ivec2( 0 ), last ),
				0
			);
			float w = ( i == 0 ? 1.0 - f.x : f.x )
				* ( j == 0 ? 1.0 - f.y : f.y );

			if ( s.z > 0.0 && abs( s.z - t ) < tolerance ) {
				sum += vec3( s.xy, 1.0 ) * max( w, 1e-3 );
			}
		}
	}
	if ( sum.z <= 0.0 ) {
		return false;
	}
	light = sum.xy / sum.z;
	return true;
}
#endif

#ifdef CHECKER_RESOLVE
// a corner of the pixel grid as the half of parity marched it (texel x:
// the corners of a row whose x + y + parity is even, every other one)
vec4 CheckerCorner( sampler2D corners, vec2 corner, float parity ) {
	float shift = mod( corner.y + parity, 2.0 );
	ivec2 at = ivec2( ( corner.x - shift ) * 0.5, corner.y );

	ivec2 last = textureSize( corners, 0 ) - 1;

	return texelFetch( corners, clamp( at, ivec2( 0 ), last ), 0 );
}

// where a corner's ray from a camera (its position, inverse view-
// projection) is at t
vec3 CornerPoint( vec2 corner, float t, vec3 eye, mat4 inverse ) {
	vec4 far = inverse * vec4( corner / screenSize * 2.0 - 1.0, 1.0, 1.0 );

	return eye + normalize( far.xyz / far.w - eye ) * t;
}
#endif

void main( void ) {
	float h = sdfBoundsSize.x / sdfVolumeSize.x;
#ifdef CASTER_CACHED
	// the shadow marched once, while nothing it depends on changes
	if ( casterCached > 0.5 ) {
		vec2 kept = texelFetch( casterCache, ivec2( gl_FragCoord.xy ), 0 ).rg;

		if ( kept.x >= 1.0 ) {
			discard;
		}
		gl_FragDepth = kept.x;
		gl_FragColor = vec4( kept.y, 1.0, 1.0, 1.0 );
		return;
	}
#endif
#ifdef CASTER
	// along the sun's rays; the box's entry may lie behind the face drawn
	vec3 ro = vWorld;
	vec3 rd = normalize( lightDataSM );
	float spread = 0.0;
#else
	vec3 ro = cameraPosition;
	vec3 rd = normalize( vWorld - cameraPosition );
	float spread = pixelAngle;
#endif
	// where on screen this ray is (pixels): this pixel, or the checkerboard's
	// corner - a texel's row is a row of corners, every other one of it
	vec2 screenPixel = gl_FragCoord.xy;
#ifdef CHECKER_PASS
	{
		vec2 texel = floor( gl_FragCoord.xy );

		screenPixel = vec2(
			texel.x * 2.0 + mod( texel.y + checkerParity, 2.0 ),
			texel.y
		);

		vec4 far = inverseViewProjection
			* vec4( screenPixel / screenSize * 2.0 - 1.0, 1.0, 1.0 );

		rd = normalize( far.xyz / far.w - ro );
	}
#endif
#ifdef CHECKER_RESOLVE
	// the pixel from its two corners this frame marched, and - where they
	// saw the same surface, reprojected - the two others the previous frame
	// did: four samples from half the rays; none of this frame's: nothing
	{
		vec2 pixel = floor( gl_FragCoord.xy );
		// which diagonal of the pixel this frame's corners are on
		float odd = mod( pixel.x + pixel.y + checkerParity, 2.0 );
		vec4 a = CheckerCorner(
			checkerCurrent,
			pixel + vec2( odd, 0.0 ),
			checkerParity
		);
		vec4 b = CheckerCorner(
			checkerCurrent,
			pixel + vec2( 1.0 - odd, 1.0 ),
			checkerParity
		);

		if ( a.w <= 0.0 && b.w <= 0.0 ) {
			discard;
		}

		vec4 now = a.w > 0.0 && b.w > 0.0
			? ( a + b ) * 0.5
			: ( a.w > 0.0 ? a : b );
		vec3 p = ro + rd * now.w;
		vec3 color = now.rgb;

		if ( checkerHistory > 0.5 ) {
			vec4 then = previousViewProjection * vec4( p, 1.0 );
			vec2 q = floor( ( then.xy / then.w * 0.5 + 0.5 ) * screenSize );
			float parity = 1.0 - checkerParity;
			float oddThen = mod( q.x + q.y + parity, 2.0 );
			vec2 c0 = q + vec2( oddThen, 0.0 );
			vec2 c1 = q + vec2( 1.0 - oddThen, 1.0 );
			vec4 ha = CheckerCorner( checkerPrevious, c0, parity );
			vec4 hb = CheckerCorner( checkerPrevious, c1, parity );
			// the same surface: within a few pixels' footprint of p
			float near = max( now.w * pixelAngle * 3.0, h * 0.5 );
			vec4 sum = vec4( 0.0 );

			vec3 pa = CornerPoint( c0, ha.w, previousCamera, previousInverse );
			vec3 pb = CornerPoint( c1, hb.w, previousCamera, previousInverse );

			if ( ha.w > 0.0 && distance( pa, p ) < near ) {
				sum += vec4( ha.rgb, 1.0 );
			}
			if ( hb.w > 0.0 && distance( pb, p ) < near ) {
				sum += vec4( hb.rgb, 1.0 );
			}
			if ( sum.w > 0.0 ) {
				color = mix( color, sum.rgb / sum.w, 0.5 );
			}
		}

		vec4 clip = viewProjection * vec4( p, 1.0 );

		gl_FragDepth = clip.z / clip.w * 0.5 + 0.5;
		gl_FragColor = vec4( color, 1.0 );
		return;
	}
#endif
#ifdef CONE_PASS
	// the cone meets the box where its axis meets one wider by the cone
	// (its radius at the box's far corner)
	vec2 span = BoxHit(
		ro,
		rd,
		( distance( ro, ( marchMin + marchMax ) * 0.5 )
			+ length( marchMax - marchMin ) * 0.5 ) * pixelAngle * CONE_SPREAD
	);
#else
	vec2 span = BoxHit( ro, rd, 0.0 );
#endif
#ifdef CASTER
	// a shadow map texel is far wider than a texel of the volume: coarse
	// steps are enough, and fewer of them
	float t = span.x;
	float near = h * 0.25;
	int maxSteps = MAX_STEPS / 2;
#else
	float t = max( span.x, 0.0 );
	float near = h * 0.05;
	int maxSteps = MAX_STEPS;
#endif
	float far = span.y;
#ifdef PROXY
	// only within the edits' sphere: a ray that misses it sees the chunks
	vec3 oc = ro - PROXY_SPHERE.xyz;
	float radius = PROXY_SPHERE.w;
#ifdef CONE_PASS
	// the cone meets the sphere where its axis meets one wider by the cone
	radius += ( length( oc ) + radius ) * pixelAngle * CONE_SPREAD;
#endif
	float b = dot( oc, rd );
	float c = dot( oc, oc ) - radius * radius;
	float disc = b * b - c;

#ifdef CONE_PASS
	// missed: nothing along these rays
	if ( disc < 0.0 ) {
		gl_FragColor = vec4( 1e6, 0.0, 0.0, 1.0 );
		gl_FragDepth = 1.0 - 1e-6;
		return;
	}
#else
	if ( disc < 0.0 ) {
		discard;
	}
#endif
	t = max( t, -b - sqrt( disc ) );
	far = min( far, -b + sqrt( disc ) );
	maxSteps = min( maxSteps, MAX_STEPS / 2 );
#ifdef CASTER
	// a hull's shadow: across its sphere, coarse steps are plenty
	maxSteps = min( maxSteps, 24 );
#endif
#endif
	int steps = 0;
	bool hit = false;
	// the field at the hit, as the march last read it
	float last = 0.0;

#ifdef DYNAMIC_MASK
	baseEdits = PROXY_MASK;
#endif
#ifdef CONE_START
	// nothing nearer along this ray than where the level before stopped,
	// less its cone's radius there (the field's distances are bounds)
	{
		float start = texelFetch(
			coneStart,
			ivec2( screenPixel * coneStartScale ),
			0
		).r;

		if ( start > 0.0 ) {
			t = max( t, start * ( 1.0 - coneStartTan ) );
		}
#ifndef CONE_PASS
		// the cone met nothing: neither will the ray
		if ( t > far ) {
			discard;
		}
#endif
	}
#endif
	// only the dynamic edits this ray can meet are looked at in its steps
	// (a proxy has its own already: the edits reaching it)
#ifndef DYNAMIC_MASK
	cseEdits = baseEdits & cseSdfRayEdits(
		ro,
		rd,
		t,
		far,
#ifdef CONE_PASS
		h + far * pixelAngle * CONE_SPREAD
#else
		h
#endif
	);
#else
	cseEdits = baseEdits;
#endif
#ifdef CONE_PASS
	// one cone around the texel's rays, r(t) = t * tan: on while the empty
	// sphere around its axis holds the cone ahead (a step of (d - r) /
	// (1 + tan)); it stops where a surface comes nearer than its radius.
	// Past the end with nothing met: 1e6; out of steps: as far as it got.
	// The depth keeps the nearest start of the draws in a texel.
	{
		float spread = pixelAngle * CONE_SPREAD;
		bool touched = false;

		for ( int i = 0; i < CONE_STEPS; i++ ) {
			float free = Distance( ro + rd * t ) * stepScale - t * spread;

			if ( free < near ) {
				touched = true;
				break;
			}
			t += free / ( 1.0 + spread );
			if ( t > far ) {
				break;
			}
		}

		float stop = touched || t <= far ? t : 1e6;

		gl_FragColor = vec4( stop, 0.0, 0.0, 1.0 );
		gl_FragDepth = stop / ( stop + 1.0 );
		return;
	}
#endif

	for ( int i = 0; i < MAX_STEPS; i++ ) {
		if ( i >= maxSteps ) {
			break;
		}

		float d = Distance( ro + rd * t );

		steps = i;
		last = d;
		if ( d < max( abs( t ) * spread, near ) ) {
			hit = true;
			break;
		}
		t += max( d * stepScale, h * 0.1 );
		if ( t > far ) {
			break;
		}
	}
	if ( !hit ) {
		discard;
	}

	vec3 p = ro + rd * t;

	// around the hit (normals, materials, occlusion): the edits near it
#ifndef DYNAMIC_MASK
	cseEdits = baseEdits & cseSdfPointEdits( p, h * 12.0 );
#endif

#ifdef PROXY
	// the chunks draw the world where the dynamic edits leave it alone
	if ( abs( last - cseSdfVolume( p ) ) < proxyThreshold ) {
		discard;
	}
#endif

#ifdef CASTER
	// a texel deeper: the SDF never shadows itself through the map (it
	// marches its own soft shadow), yet shadows what lies behind it
	vec4 clip = viewProjection * vec4( p + rd * h, 1.0 );

#else
	vec4 clip = viewProjection * vec4( p, 1.0 );
#endif

#ifdef CASTER
#if defined( SM_DEPTHTEXTURE ) && SM_DEPTHTEXTURE == 1
	clip.z += biasAndScaleSM.x * clip.w;
#endif
	float depth = clamp( 0.5 * clip.z / clip.w + 0.5, 0.0, 1.0 );
	float mapped = ( clip.z + depthValuesSM.x ) / depthValuesSM.y
		+ biasAndScaleSM.x;

	gl_FragDepth = depth;
#ifdef CASTER_STORE
	// kept for the shadow pass: the depth and the map's colour
	gl_FragColor = vec4( depth, mapped, 0.0, 1.0 );
#else
	gl_FragColor = vec4( mapped, 1.0, 1.0, 1.0 );
#endif
#else
	gl_FragDepth = clip.z / clip.w * 0.5 + 0.5;

	vec3 n = Normal( p, h * 0.5 );
	vec3 color;

#ifdef LIGHT_PASS
	// the dear part of the lighting, once per texel: the soft shadow and
	// the occlusion, and how far along the ray they are
	{
		vec3 l = -normalize( sunDirection );
		float shadow = 1.0;
		float ao = quality > 0.5 ? Occlusion( p, n, h * 2.0 ) : 1.0;

		if ( quality > 1.5 && dot( n, l ) > 0.0 ) {
			shadow = Shadow( p + n * h, l, h, length( sdfBoundsSize ) );
		}
		gl_FragColor = vec4( shadow, ao, t, 1.0 );
		return;
	}
#endif

	if ( debugMode > 2.5 ) {
		float band = fract( Distance( p + n * h * 2.0 ) / h );

		color = vec3( band );
	} else if ( debugMode > 1.5 ) {
		float heat = float( steps ) / float( MAX_STEPS );

		color = mix( vec3( 0.1, 0.2, 1.0 ), vec3( 1.0, 0.1, 0.0 ), heat );
	} else if ( debugMode > 0.5 ) {
		color = n * 0.5 + 0.5;
	} else {
		// the volume's colours, then the dynamic edits' where they show
		vec3 q = p - n * h * 0.5;
		vec3 albedo = VolumeColor( q );
		float layer = -1.0;

		cseSdfDynamic( q, cseSdfVolume( q ), layer, albedo );
		vec3 l = -normalize( sunDirection );
		float lit = max( dot( n, l ), 0.0 );
		// the soft shadow and the occlusion: from the light buffer where it
		// saw this surface, else marched here
		vec2 marched = vec2( 1.0 );
		bool known = false;

#ifdef LIGHT_START
		known = LightFrom(
			screenPixel,
			t,
			t * pixelAngle * 4.0 + h,
			marched
		);
#endif
		if ( !known ) {
			marched.y = quality > 0.5 ? Occlusion( p, n, h * 2.0 ) : 1.0;
			if ( quality > 1.5 && lit > 0.0 ) {
				marched.x = Shadow( p + n * h, l, h, length( sdfBoundsSize ) );
			}
		}

		float ao = marched.y;

		lit *= marched.x;
#ifdef OCCLUDERS
		ao *= cseSdfOccluders( p, n );
#endif
#ifdef SHADOWMAP
		if ( lit > 0.0 ) {
			lit *= cseSdfShadowMap( p + n * sdfShadowInfo.w );
		}
#endif
		vec3 sky = mix( groundColor, skyColor,
			dot( n, skyDirection ) * 0.5 + 0.5 );

#ifdef PROXY
		// as the chunks: their occlusion darkens the vertex color
		color = albedo * ao * ( sky + sunColor * lit );
#else
		color = albedo * ( sky * ao + sunColor * lit );
#endif
	}
#ifdef CHECKER_PASS
	// the colour, and how far along the corner's ray (the resolve rebuilds
	// the depth from it)
	gl_FragColor = vec4( color, t );
#else
	gl_FragColor = vec4( color, 1.0 );
#endif
#endif
}
`;

/**
 * The mesh tier's chunks in the sun's shadow map: plain triangles, cut where
 * the dynamic edits change the world (as SdfMaterialPlugin cuts them on
 * screen), so a hole lets the light in. Babylon's ShadowGenerator sets the
 * SM_* defines and uniforms; the depth is a depth texture (PCF).
 */
export const ChunkDepthShaderName = "cseSdfChunkDepth";

export const ChunkDepthVertex = /* glsl */ `
precision highp float;

attribute vec3 position;

uniform mat4 world;
uniform mat4 viewProjection;
uniform vec3 biasAndScaleSM;
uniform vec2 depthValuesSM;

varying vec3 vWorld;
varying float vDepthSM;

void main( void ) {
	vec4 worldPos = world * vec4( position, 1.0 );

	vWorld = worldPos.xyz;
	gl_Position = viewProjection * worldPos;
#if defined( SM_DEPTHTEXTURE ) && SM_DEPTHTEXTURE == 1
	gl_Position.z += biasAndScaleSM.x * gl_Position.w;
#endif
	vDepthSM = ( gl_Position.z + depthValuesSM.x ) / depthValuesSM.y
		+ biasAndScaleSM.x;
}
`;

export const ChunkDepthFragment = /* glsl */ `
precision highp float;

varying vec3 vWorld;
varying float vDepthSM;

${ DynamicDeclarations }
uniform float sdfCarveThreshold;

${ ShapeFunctions }
${ DynamicFunctions }

void main( void ) {
	if ( cseSdfDynamicDistance( vWorld, 0.0 ) > sdfCarveThreshold ) {
		discard;
	}
	gl_FragColor = vec4( vDepthSM, 1.0, 1.0, 1.0 );
}
`;
