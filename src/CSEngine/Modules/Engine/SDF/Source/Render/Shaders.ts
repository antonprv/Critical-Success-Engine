// Created by Anton Piruev in 2026.
// Any direct commercial use of derivative work is strictly prohibited.

/**
 * The ray marcher of the dense SDF layer (plan.md 3.1 way A, 8.1 variant 1):
 * drawn on the back faces of a box around the volume, it marches the 3D
 * texture from where the ray enters the box, lights the hit in the same pass
 * (forward, plan.md 21.1) and writes its depth, so Babylon's own depth test
 * puts meshes in front of and behind it.
 *
 * Written in Babylon's GLSL dialect; it needs WebGL2 (sampler3D, texelFetch,
 * gl_FragDepth in the core).
 */

/** Shader store name (Babylon looks up `${name}VertexShader` etc.). */
export const RaymarchShaderName = "cseSdfRaymarch";

export const RaymarchVertex = /* glsl */ `
precision highp float;

attribute vec3 position;

uniform mat4 world;
uniform mat4 viewProjection;

varying vec3 vWorld;

void main( void ) {
	vec4 worldPos = world * vec4( position, 1.0 );

	vWorld = worldPos.xyz;
	gl_Position = viewProjection * worldPos;
}
`;

export const RaymarchFragment = /* glsl */ `
precision highp float;
precision highp sampler3D;

varying vec3 vWorld;

uniform sampler3D sdfVolume;
uniform mat4 viewProjection;
uniform vec3 cameraPosition;
// the box the texture covers and its texel count
uniform vec3 boundsMin;
uniform vec3 boundsSize;
uniform vec3 volumeSize;
// world distance of a byte of 0 or 255 (the encoded range)
uniform float range;
// how far a pixel spans per unit of distance (tan(fov / 2) * 2 / height)
uniform float pixelAngle;
uniform float stepScale;
uniform vec3 sunDirection;
uniform vec3 sunColor;
uniform vec3 skyColor;
uniform vec3 groundColor;
uniform vec3 palette[8];
// 0 lit, 1 normals, 2 step count, 3 distance bands
uniform float debugMode;
// 0 plain, 1 ambient occlusion, 2 also soft shadows
uniform float quality;

const int MAX_STEPS = 160;

float Distance( vec3 p ) {
	vec3 uvw = ( p - boundsMin ) / boundsSize;

	return ( texture( sdfVolume, uvw ).r - 0.5 ) * 2.0 * range;
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

int MaterialAt( vec3 p ) {
	vec3 uvw = clamp( ( p - boundsMin ) / boundsSize, 0.0, 0.9999 );

	float id = texelFetch( sdfVolume, ivec3( uvw * volumeSize ), 0 ).g;

	return int( id * 255.0 + 0.5 );
}

// where a ray enters and leaves the box (x > y: it misses)
vec2 BoxHit( vec3 ro, vec3 rd ) {
	vec3 inv = 1.0 / rd;
	vec3 t0 = ( boundsMin - ro ) * inv;
	vec3 t1 = ( boundsMin + boundsSize - ro ) * inv;
	vec3 lo = min( t0, t1 );
	vec3 hi = max( t0, t1 );

	return vec2(
		max( max( lo.x, lo.y ), lo.z ),
		min( min( hi.x, hi.y ), hi.z )
	);
}

float Occlusion( vec3 p, vec3 n, float h ) {
	float occlusion = 0.0;
	float weight = 1.0;

	for ( int i = 1; i <= 5; i++ ) {
		float t = h * float( i );

		float d = Distance( p + n * t );

		occlusion += weight * clamp( ( t - d ) / t, 0.0, 1.0 );
		weight *= 0.5;
	}
	return 1.0 - occlusion / 1.9375;
}

// penumbra by the closest miss along a ray to the sun (k d / t)
float Shadow( vec3 p, vec3 l, float start, float far ) {
	float light = 1.0;
	float t = start;

	for ( int i = 0; i < 48; i++ ) {
		float d = Distance( p + l * t );

		light = min( light, 8.0 * d / t );
		t += clamp( d, start * 0.5, range );
		if ( light < 0.01 || t > far ) {
			break;
		}
	}
	return clamp( light, 0.0, 1.0 );
}

void main( void ) {
	vec3 ro = cameraPosition;
	vec3 rd = normalize( vWorld - cameraPosition );
	vec2 span = BoxHit( ro, rd );
	float h = boundsSize.x / volumeSize.x;
	float t = max( span.x, 0.0 );
	float far = span.y;
	int steps = 0;
	bool hit = false;

	for ( int i = 0; i < MAX_STEPS; i++ ) {
		float d = Distance( ro + rd * t );

		steps = i;
		if ( d < max( t * pixelAngle, h * 0.05 ) ) {
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
	vec3 n = Normal( p, h * 0.5 );
	vec4 clip = viewProjection * vec4( p, 1.0 );

	gl_FragDepth = clip.z / clip.w * 0.5 + 0.5;

	vec3 color;

	if ( debugMode > 2.5 ) {
		float band = fract( Distance( p + n * h * 2.0 ) / h );

		color = vec3( band );
	} else if ( debugMode > 1.5 ) {
		float heat = float( steps ) / float( MAX_STEPS );

		color = mix( vec3( 0.1, 0.2, 1.0 ), vec3( 1.0, 0.1, 0.0 ), heat );
	} else if ( debugMode > 0.5 ) {
		color = n * 0.5 + 0.5;
	} else {
		vec3 albedo = palette[MaterialAt( p - n * h * 0.5 ) & 7];
		vec3 l = -normalize( sunDirection );
		float ao = quality > 0.5 ? Occlusion( p, n, h * 2.0 ) : 1.0;
		float lit = max( dot( n, l ), 0.0 );

		if ( quality > 1.5 && lit > 0.0 ) {
			lit *= Shadow( p + n * h, l, h, length( boundsSize ) );
		}
		color = albedo * ( mix( groundColor, skyColor, n.y * 0.5 + 0.5 ) * ao
			+ sunColor * lit );
	}
	gl_FragColor = vec4( color, 1.0 );
}
`;
