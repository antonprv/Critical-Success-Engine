// Created by Anton Piruev in 2026.
// Any direct commercial use of derivative work is strictly prohibited.
//
// The shaders below port AMD FidelityFX Super Resolution 1.0.2 (EASU and
// RCAS, https://github.com/GPUOpen-Effects/FidelityFX-FSR) to GLSL ES 3.0,
// gathers as texel fetches. Their original is under this licence:
//
// Copyright (c) 2021 Advanced Micro Devices, Inc. All rights reserved.
//
// Permission is hereby granted, free of charge, to any person obtaining a
// copy of this software and associated documentation files (the
// "Software"), to deal in the Software without restriction, including
// without limitation the rights to use, copy, modify, merge, publish,
// distribute, sublicense, and/or sell copies of the Software, and to permit
// persons to whom the Software is furnished to do so, subject to the
// following conditions:
//
// The above copyright notice and this permission notice shall be included
// in all copies or substantial portions of the Software.
//
// THE SOFTWARE IS PROVIDED "AS IS", WITHOUT WARRANTY OF ANY KIND, EXPRESS
// OR IMPLIED, INCLUDING BUT NOT LIMITED TO THE WARRANTIES OF
// MERCHANTABILITY, FITNESS FOR A PARTICULAR PURPOSE AND NONINFRINGEMENT. IN
// NO EVENT SHALL THE AUTHORS OR COPYRIGHT HOLDERS BE LIABLE FOR ANY CLAIM,
// DAMAGES OR OTHER LIABILITY, WHETHER IN AN ACTION OF CONTRACT, TORT OR
// OTHERWISE, ARISING FROM, OUT OF OR IN CONNECTION WITH THE SOFTWARE OR THE
// USE OR OTHER DEALINGS IN THE SOFTWARE.

import type { Camera } from "@babylonjs/core/Cameras/camera";
import { Constants } from "@babylonjs/core/Engines/constants";
import {
	EffectRenderer,
	EffectWrapper,
} from "@babylonjs/core/Materials/effectRenderer";
import {
	RenderTargetTexture,
} from "@babylonjs/core/Materials/Textures/renderTargetTexture";
import { Texture } from "@babylonjs/core/Materials/Textures/texture";
import type { Observer } from "@babylonjs/core/Misc/observable";
import type { Scene } from "@babylonjs/core/scene";
import "@babylonjs/core/Shaders/postprocess.vertex";

/** How the frame is drawn smaller and brought up to the screen. */
export interface FsrUpscalerOptions {
	/** The frame's size to the screen's, 0.25..1. Default 0.5. */
	Scale?: number;
	/**
	 * RCAS: 0 the sharpest, each 1 halves it; below 0 no sharpening.
	 * Default 0.25.
	 */
	Sharpness?: number;
}

/** Edge-adaptive upsampling: twelve texels, a Lanczos-like lobe. */
const EasuShader = /* glsl */ `
precision highp float;
uniform sampler2D source;
// the frame's size to the output's, and where an output pixel lands
uniform vec4 easuScale;
varying vec2 vUV;

vec3 Tap( ivec2 p ) {
	return texelFetch(
		source,
		clamp( p, ivec2( 0 ), textureSize( source, 0 ) - 1 ),
		0
	).rgb;
}

// luma times two, in two multiply-adds
float Luma( vec3 c ) {
	return c.b * 0.5 + ( c.r * 0.5 + c.g );
}

// the gradient's direction and how much of an edge it is, around texel c
// (a above, b left, d right, e below), weighed bilinearly
void Edge(
	inout vec2 dir,
	inout float len,
	float w,
	float a,
	float b,
	float c,
	float d,
	float e
) {
	float dirX = d - b;
	float lenX = clamp(
		abs( dirX ) / max( max( abs( d - c ), abs( c - b ) ), 1e-30 ),
		0.0,
		1.0
	);
	float dirY = e - a;
	float lenY = clamp(
		abs( dirY ) / max( max( abs( e - c ), abs( c - a ) ), 1e-30 ),
		0.0,
		1.0
	);

	dir += vec2( dirX, dirY ) * w;
	len += ( lenX * lenX + lenY * lenY ) * w;
}

// the kernel as the four nearest texels shape it, and its sums
vec2 kernelDir;
vec2 kernelLen;
float kernelLobe;
float kernelClip;
vec3 sum = vec3( 0.0 );
float weights = 0.0;

// a texel this far from the pixel's position, into the sums
void Accumulate( vec2 offset, vec3 color ) {
	vec2 v = vec2(
		offset.x * kernelDir.x + offset.y * kernelDir.y,
		offset.x * -kernelDir.y + offset.y * kernelDir.x
	) * kernelLen;
	float d2 = min( dot( v, v ), kernelClip );
	// (25/16 (2/5 x^2 - 1)^2 - 9/16) (lobe x^2 - 1)^2: Lanczos 2, windowed
	float base = 0.4 * d2 - 1.0;
	float window = kernelLobe * d2 - 1.0;
	float w = ( 25.0 / 16.0 * base * base - 9.0 / 16.0 ) * window * window;

	sum += color * w;
	weights += w;
}

void main( void ) {
	vec2 pp = floor( gl_FragCoord.xy ) * easuScale.xy + easuScale.zw;
	vec2 fp = floor( pp );
	ivec2 f0 = ivec2( fp );

	pp -= fp;

	//    b c
	//  e f g h
	//  i j k l
	//    n o
	vec3 b = Tap( f0 + ivec2( 0, -1 ) );
	vec3 c = Tap( f0 + ivec2( 1, -1 ) );
	vec3 e = Tap( f0 + ivec2( -1, 0 ) );
	vec3 f = Tap( f0 );
	vec3 g = Tap( f0 + ivec2( 1, 0 ) );
	vec3 h = Tap( f0 + ivec2( 2, 0 ) );
	vec3 i = Tap( f0 + ivec2( -1, 1 ) );
	vec3 j = Tap( f0 + ivec2( 0, 1 ) );
	vec3 k = Tap( f0 + ivec2( 1, 1 ) );
	vec3 l = Tap( f0 + ivec2( 2, 1 ) );
	vec3 n = Tap( f0 + ivec2( 0, 2 ) );
	vec3 o = Tap( f0 + ivec2( 1, 2 ) );
	float bL = Luma( b );
	float cL = Luma( c );
	float eL = Luma( e );
	float fL = Luma( f );
	float gL = Luma( g );
	float hL = Luma( h );
	float iL = Luma( i );
	float jL = Luma( j );
	float kL = Luma( k );
	float lL = Luma( l );
	float nL = Luma( n );
	float oL = Luma( o );
	vec2 dir = vec2( 0.0 );
	float len = 0.0;

	Edge( dir, len, ( 1.0 - pp.x ) * ( 1.0 - pp.y ), bL, eL, fL, gL, jL );
	Edge( dir, len, pp.x * ( 1.0 - pp.y ), cL, fL, gL, hL, kL );
	Edge( dir, len, ( 1.0 - pp.x ) * pp.y, fL, iL, jL, kL, nL );
	Edge( dir, len, pp.x * pp.y, gL, jL, kL, lL, oL );

	float dirR = dot( dir, dir );

	if ( dirR < 1.0 / 32768.0 ) {
		dir = vec2( 1.0, 0.0 );
	} else {
		dir *= inversesqrt( dirR );
	}
	len *= 0.5;
	len *= len;

	// the kernel stretched along the edge: 1 straight, sqrt 2 diagonal
	float stretch = 1.0 / max( abs( dir.x ), abs( dir.y ) );

	kernelDir = dir;
	kernelLen = vec2( 1.0 + ( stretch - 1.0 ) * len, 1.0 - 0.5 * len );
	kernelLobe = 0.5 + ( 0.25 - 0.04 - 0.5 ) * len;
	kernelClip = 1.0 / kernelLobe;
	Accumulate( vec2( 0.0, -1.0 ) - pp, b );
	Accumulate( vec2( 1.0, -1.0 ) - pp, c );
	Accumulate( vec2( -1.0, 1.0 ) - pp, i );
	Accumulate( vec2( 0.0, 1.0 ) - pp, j );
	Accumulate( -pp, f );
	Accumulate( vec2( -1.0, 0.0 ) - pp, e );
	Accumulate( vec2( 1.0, 1.0 ) - pp, k );
	Accumulate( vec2( 2.0, 1.0 ) - pp, l );
	Accumulate( vec2( 2.0, 0.0 ) - pp, h );
	Accumulate( vec2( 1.0, 0.0 ) - pp, g );
	Accumulate( vec2( 1.0, 2.0 ) - pp, o );
	Accumulate( vec2( 0.0, 2.0 ) - pp, n );

	// no ringing past the four nearest
	vec3 low = min( min( f, g ), min( j, k ) );
	vec3 high = max( max( f, g ), max( j, k ) );

	gl_FragColor = vec4( clamp( sum / weights, low, high ), 1.0 );
}
`;

/** Contrast-adaptive sharpening over the cross of five pixels. */
const RcasShader = /* glsl */ `
precision highp float;
uniform sampler2D source;
// exp2( -sharpness )
uniform float rcasSharpness;
varying vec2 vUV;

vec3 Tap( ivec2 p ) {
	return texelFetch(
		source,
		clamp( p, ivec2( 0 ), textureSize( source, 0 ) - 1 ),
		0
	).rgb;
}

void main( void ) {
	ivec2 p = ivec2( gl_FragCoord.xy );
	//   b
	// d e f
	//   h
	vec3 b = Tap( p + ivec2( 0, -1 ) );
	vec3 d = Tap( p + ivec2( -1, 0 ) );
	vec3 e = Tap( p );
	vec3 f = Tap( p + ivec2( 1, 0 ) );
	vec3 h = Tap( p + ivec2( 0, 1 ) );
	vec3 low = min( min( b, d ), min( f, h ) );
	vec3 high = max( max( b, d ), max( f, h ) );
	// the most negative lobe that keeps every channel in [0, 1]
	vec3 hitMin = min( low, e ) / max( 4.0 * high, 1e-5 );
	vec3 hitMax = ( 1.0 - max( high, e ) ) / min( 4.0 * low - 4.0, -1e-5 );
	vec3 lobes = max( -hitMin, hitMax );
	float lobe = max(
		-( 0.25 - 1.0 / 16.0 ),
		min( max( lobes.r, max( lobes.g, lobes.b ) ), 0.0 )
	) * rcasSharpness;

	gl_FragColor = vec4(
		( lobe * ( b + d + f + h ) + e ) / ( 4.0 * lobe + 1.0 ),
		1.0
	);
}
`;

/**
 * Render scale with FSR 1 (plan.md 21.8): the scene's camera draws into a
 * target `Scale` of the screen - every pass inside it, ray marches too,
 * pays for that many pixels (FrameSize) - and EASU brings the frame up to
 * the screen, RCAS sharpens it. Spatial only: nothing from other frames.
 */
export class FsrUpscaler {
	/** What the camera draws into. */
	public readonly Input: RenderTargetTexture;

	public Scale: number;

	public Sharpness: number;

	private readonly _upscaled: RenderTargetTexture;

	private readonly _renderer: EffectRenderer;

	private readonly _easu: EffectWrapper;

	private readonly _rcas: EffectWrapper;

	private readonly _before: Observer<Scene>;

	private readonly _after: Observer<Scene>;

	private _camera: Camera | null = null;

	public constructor(
		private readonly _scene: Scene,
		options: FsrUpscalerOptions = {},
	) {
		const engine = _scene.getEngine();
		const Target = (
			name: string,
			depth: boolean,
		): RenderTargetTexture => new RenderTargetTexture(
			name,
			{ width: 1, height: 1 },
			_scene,
			{
				generateMipMaps: false,
				generateDepthBuffer: depth,
				samplingMode: Texture.NEAREST_SAMPLINGMODE,
				type: Constants.TEXTURETYPE_UNSIGNED_BYTE,
			},
		);

		this.Scale = options.Scale ?? 0.5;
		this.Sharpness = options.Sharpness ?? 0.25;
		this.Input = Target( "fsrInput", true );
		this._upscaled = Target( "fsrUpscaled", false );
		this._renderer = new EffectRenderer( engine );
		this._easu = new EffectWrapper( {
			engine,
			name: "fsrEasu",
			fragmentShader: EasuShader,
			uniformNames: [ "easuScale" ],
			samplerNames: [ "source" ],
		} );
		this._rcas = new EffectWrapper( {
			engine,
			name: "fsrRcas",
			fragmentShader: RcasShader,
			uniformNames: [ "rcasSharpness" ],
			samplerNames: [ "source" ],
		} );
		this._easu.onApplyObservable.add( () => {
			const input = this.Input.getSize();
			const output = this.OutputSize();
			const x = input.width / output.width;
			const y = input.height / output.height;

			this._easu.effect.setTexture( "source", this.Input );
			this._easu.effect.setFloat4(
				"easuScale",
				x,
				y,
				0.5 * x - 0.5,
				0.5 * y - 0.5,
			);
		} );
		this._rcas.onApplyObservable.add( () => {
			this._rcas.effect.setTexture( "source", this._upscaled );
			this._rcas.effect.setFloat(
				"rcasSharpness",
				Math.pow( 2, -this.Sharpness ),
			);
		} );
		// first: every pass sized by the frame (FrameSize) sees this frame's
		this._before = _scene.onBeforeRenderObservable.add(
			() => this.Attach(),
			undefined,
			true,
		)!;
		this._after = _scene.onAfterRenderObservable.add(
			() => this.Present(),
		);
	}

	public Dispose(): void {
		this._scene.onBeforeRenderObservable.remove( this._before );
		this._scene.onAfterRenderObservable.remove( this._after );
		this.Detach();
		this._easu.dispose();
		this._rcas.dispose();
		this._renderer.dispose();
		this.Input.dispose();
		this._upscaled.dispose();
	}

	/** The screen's pixels (the canvas's, whatever is bound). */
	private OutputSize(): { width: number; height: number; } {
		const engine = this._scene.getEngine();

		return {
			width: Math.max( 1, engine.getRenderWidth( true ) ),
			height: Math.max( 1, engine.getRenderHeight( true ) ),
		};
	}

	/** Before a frame: the target sized, the active camera drawing into it. */
	private Attach(): void {
		const camera = this._scene.activeCamera;
		const output = this.OutputSize();
		const scale = Math.min( 1, Math.max( 0.25, this.Scale ) );
		const size = {
			width: Math.max( 1, Math.round( output.width * scale ) ),
			height: Math.max( 1, Math.round( output.height * scale ) ),
		};

		if ( camera !== this._camera ) {
			this.Detach();
			this._camera = camera;
		}
		if ( !camera ) {
			return;
		}
		for ( const [ target, wanted ] of [
			[ this.Input, size ],
			[ this._upscaled, output ],
		] as const ) {
			const now = target.getSize();

			if ( now.width !== wanted.width || now.height !== wanted.height ) {
				target.resize( wanted );
			}
		}
		camera.outputRenderTarget = this.Input;
	}

	private Detach(): void {
		if ( this._camera?.outputRenderTarget === this.Input ) {
			this._camera.outputRenderTarget = null;
		}
		this._camera = null;
	}

	/** After a frame: up to the screen, sharpened. */
	private Present(): void {
		if ( !this._camera || !this._easu.isReady() || !this._rcas.isReady() ) {
			return;
		}

		const sharpen = this.Sharpness >= 0;

		this._scene.getEngine().restoreDefaultFramebuffer();
		this._renderer.render(
			this._easu,
			sharpen ? this._upscaled.renderTarget : null,
		);
		if ( sharpen ) {
			this._renderer.render( this._rcas, null );
		}
	}
}
