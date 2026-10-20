// Created by Anton Piruev in 2026.
// Any direct commercial use of derivative work is strictly prohibited.

// raw.html: does Babylon cost the ray marcher anything? One lean shader -
// the inverted Mandelbrot's formula marched, a normal, a sun and a sky - is
// drawn full screen either through Babylon (an EffectRenderer on its own
// engine) or through bare WebGL2 on a canvas of its own, one at a time
// (sdfDemo.AB( 0 ): Babylon, AB( 1 ): bare): the same GPU work, measured
// in one page (Scratch: ab4.mjs).

import { Engine } from "@babylonjs/core/Engines/engine";
import {
	EffectRenderer,
	EffectWrapper,
} from "@babylonjs/core/Materials/effectRenderer";
import "@babylonjs/core/Shaders/postprocess.vertex";
import {
	FormulaBase,
	InvertedMandelbrotFormula,
} from "../Source/Index";

const formula = new FormulaBase( InvertedMandelbrotFormula( 20 ) );
const params = formula.ParamValues();
const frame = formula.FrameValues();

// the view of the demo's overview: an arc camera round the cave's centre
const alpha = -1.2083;
const beta = 1.2;
const radius = 12;
const eye = [
	radius * Math.cos( alpha ) * Math.sin( beta ),
	radius * Math.cos( beta ),
	radius * Math.sin( alpha ) * Math.sin( beta ),
];

/** The shared body: `RESULT` is how a dialect writes the colour. */
const Body = `
${ formula.Glsl }
uniform vec3 eye;
uniform vec2 screen;

void main( void ) {
	vec3 forward = normalize( -eye );
	vec3 right = normalize( cross( vec3( 0.0, 1.0, 0.0 ), forward ) );
	vec3 up = cross( forward, right );
	float tanHalf = tan( 0.4 );
	vec2 ndc = gl_FragCoord.xy / screen * 2.0 - 1.0;
	vec3 rd = normalize( forward + ( right * ndc.x * screen.x / screen.y
		+ up * ndc.y ) * tanHalf );
	float pixel = tanHalf * 2.0 / screen.y;
	float t = 0.0;
	bool hit = false;

	for ( int i = 0; i < 160; i++ ) {
		float detail = t * pixel;
		float d = cseSdfFormula( eye + rd * t, detail );

		if ( d < max( detail, 0.0025 ) ) {
			hit = true;
			break;
		}
		t += max( d * 0.9, 0.005 );
		if ( t > 120.0 ) {
			break;
		}
	}

	vec3 color = vec3( 0.08, 0.1, 0.14 );

	if ( hit ) {
		vec3 p = eye + rd * t;
		float e = max( t * pixel, 0.01 );
		vec2 k = vec2( 1.0, -1.0 );
		vec3 n = normalize(
			k.xyy * cseSdfFormula( p + k.xyy * e, e )
			+ k.yyx * cseSdfFormula( p + k.yyx * e, e )
			+ k.yxy * cseSdfFormula( p + k.yxy * e, e )
			+ k.xxx * cseSdfFormula( p + k.xxx * e, e )
		);
		float sun = max( dot( n, normalize( vec3( 0.4, 1.0, 0.5 ) ) ), 0.0 );

		color = mix(
			vec3( 0.85, 0.42, 0.25 ),
			vec3( 0.35, 0.5, 0.85 ),
			cseFormulaMix
		)
			* ( 0.35 + 0.65 * sun );
	}
	RESULT = vec4( color, 1.0 );
}
`;

const canvasA = document.getElementById( "babylon" ) as HTMLCanvasElement;
const canvasB = document.getElementById( "bare" ) as HTMLCanvasElement;
let mode = 0;

for ( const canvas of [ canvasA, canvasB ] ) {
	canvas.width = innerWidth;
	canvas.height = innerHeight;
}

// Babylon: its engine, a full-screen effect
const engine = new Engine( canvasA, false, { preserveDrawingBuffer: false } );
const renderer = new EffectRenderer( engine );
const wrapper = new EffectWrapper( {
	engine,
	name: "rawBench",
	fragmentShader:
		`precision highp float;\n#define RESULT gl_FragColor\n${ Body }`,
	uniformNames: [ "sdfFormulaParams", "sdfFormulaFrame", "eye", "screen" ],
} );

wrapper.onApplyObservable.add( () => {
	const effect = wrapper.effect;

	effect.setFloatArray( "sdfFormulaParams", params );
	effect.setFloatArray4( "sdfFormulaFrame", frame );
	effect.setFloat3( "eye", eye[0]!, eye[1]!, eye[2]! );
	effect.setFloat2( "screen", canvasA.width, canvasA.height );
} );
engine.runRenderLoop( () => {
	if ( mode === 0 && wrapper.effect.isReady() ) {
		renderer.render( wrapper );
	}
} );

// bare WebGL2: a program, a triangle over the screen
const gl = canvasB.getContext( "webgl2", { antialias: false } )!;
const Shader = ( type: number, source: string ): WebGLShader => {
	const shader = gl.createShader( type )!;

	gl.shaderSource( shader, source );
	gl.compileShader( shader );
	if ( !gl.getShaderParameter( shader, gl.COMPILE_STATUS ) ) {
		throw new Error( gl.getShaderInfoLog( shader ) ?? "shader" );
	}
	return shader;
};
const program = gl.createProgram();

gl.attachShader( program, Shader( gl.VERTEX_SHADER, `#version 300 es
void main() {
	vec2 p = vec2(
		float( ( gl_VertexID << 1 ) & 2 ),
		float( gl_VertexID & 2 )
	);
	gl_Position = vec4( p * 2.0 - 1.0, 0.0, 1.0 );
}` ) );
gl.attachShader( program, Shader( gl.FRAGMENT_SHADER, `#version 300 es
precision highp float;
out vec4 fragColor;
#define RESULT fragColor
${ Body }` ) );
gl.linkProgram( program );

const at = ( name: string ): WebGLUniformLocation
	| null => gl.getUniformLocation( program, name );

gl.useProgram( program );
gl.uniform1fv( at( "sdfFormulaParams" ), params );
gl.uniform4fv( at( "sdfFormulaFrame" ), frame );
gl.uniform3f( at( "eye" ), eye[0]!, eye[1]!, eye[2]! );
gl.uniform2f( at( "screen" ), canvasB.width, canvasB.height );
gl.viewport( 0, 0, canvasB.width, canvasB.height );

const Bare = (): void => {
	if ( mode === 1 ) {
		gl.drawArrays( gl.TRIANGLES, 0, 3 );
	}
	requestAnimationFrame( Bare );
};

requestAnimationFrame( Bare );

/**
 * Draws `count` frames of one path back to back and waits for the GPU (a
 * pixel read back): the milliseconds per frame, with no compositor or
 * vsync in the way.
 */
const Bench = ( which: number, count: number ): number => {
	const pixel = new Uint8Array( 4 );
	const start = performance.now();

	for ( let i = 0; i < count; i++ ) {
		if ( which === 0 ) {
			renderer.render( wrapper );
		} else {
			gl.drawArrays( gl.TRIANGLES, 0, 3 );
		}
	}
	const context = which === 0 ? engine._gl : gl;

	context.readPixels(
		0,
		0,
		1,
		1,
		context.RGBA,
		context.UNSIGNED_BYTE,
		pixel,
	);
	return ( performance.now() - start ) / count;
};

Object.assign( window, {
	sdfReady: true,
	sdfDemo: {
		Bench,
		AB: ( which: number ): void => {
			mode = which;
			canvasA.style.display = which === 0 ? "block" : "none";
			canvasB.style.display = which === 1 ? "block" : "none";
		},
	},
} );
