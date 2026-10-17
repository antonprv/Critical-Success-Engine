// Created by Anton Piruev in 2026.
// Any direct commercial use of derivative work is strictly prohibited.

import { describe, expect, it } from "vitest";
import {
	ChooseTier,
	DetectCapabilities,
	SdfTier,
	Supports,
	type SdfCapabilities,
} from "../Source/Index";

const Desktop: SdfCapabilities = {
	WebGpu: true,
	WebGl2: true,
	Max3dTextureSize: 2048,
	ColorBufferFloat: true,
};

const OldPhone: SdfCapabilities = {
	WebGpu: false,
	WebGl2: false,
	Max3dTextureSize: 0,
	ColorBufferFloat: false,
};

describe( "SDF tiers", () => {
	it( "know what a device supports", () => {
		expect( Supports( Desktop, SdfTier.Gpu ) ).toBe( true );
		expect( Supports( OldPhone, SdfTier.Gpu ) ).toBe( false );
		expect( Supports( { ...Desktop, Max3dTextureSize: 128 }, SdfTier.Gl ) )
			.toBe( false );
		expect( Supports( OldPhone, SdfTier.Mesh ) ).toBe( true );
	} );

	it( "pick the best available tier, or the mesh one", () => {
		expect( ChooseTier( Desktop ).Tier ).toBe( SdfTier.Gl );
		expect( ChooseTier( Desktop, {
			Available: [ SdfTier.Gpu, SdfTier.Gl, SdfTier.Mesh ],
		} ).Tier ).toBe( SdfTier.Gpu );
		expect( ChooseTier( { ...Desktop, WebGpu: false }, {
			Available: [ SdfTier.Gpu, SdfTier.Gl ],
		} ).Tier ).toBe( SdfTier.Gl );
		expect( ChooseTier( OldPhone ) ).toEqual( {
			Tier: SdfTier.Mesh,
			Reason: "no ray-marching tier here",
		} );
	} );

	it( "fall back to meshes when ray marching is too slow", () => {
		expect( ChooseTier( Desktop, { BenchmarkMs: 9 } ) ).toEqual( {
			Tier: SdfTier.Mesh,
			Reason: "ray marching took 9 ms",
		} );
		expect( ChooseTier( Desktop, { BenchmarkMs: 9, BudgetMs: 10 } ).Tier )
			.toBe( SdfTier.Gl );
	} );

	it( "honour the player's choice when the device can do it", () => {
		expect( ChooseTier( Desktop, { Forced: SdfTier.Mesh } ) ).toEqual( {
			Tier: SdfTier.Mesh,
			Reason: "chosen in the settings",
		} );
		expect( ChooseTier( OldPhone, { Forced: SdfTier.Gl } ).Tier )
			.toBe( SdfTier.Mesh );
		expect( ChooseTier( Desktop, { Forced: SdfTier.Gpu } ).Tier )
			.toBe( SdfTier.Gl );
	} );

	it( "read a WebGL context", () => {
		const gl2 = {
			MAX_3D_TEXTURE_SIZE: 0x8073,
			getParameter: ( name: number ) => ( name === 0x8073 ? 2048 : null ),
			getExtension: (
				name: string,
			) => ( name === "EXT_color_buffer_float" ? {} : null ),
		} as unknown as WebGL2RenderingContext;
		const gl1 = {
			getExtension: () => null,
		} as unknown as WebGLRenderingContext;
		const broken = {
			MAX_3D_TEXTURE_SIZE: 0x8073,
			getParameter: () => null,
			getExtension: () => null,
		} as unknown as WebGL2RenderingContext;

		expect( DetectCapabilities( gl2, true ) ).toEqual( Desktop );
		expect( DetectCapabilities( gl1, false ) ).toEqual( OldPhone );
		expect( DetectCapabilities( null, false ) ).toEqual( OldPhone );
		expect( DetectCapabilities( broken, false ).Max3dTextureSize )
			.toBe( 0 );
	} );
} );
