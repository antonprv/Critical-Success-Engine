// Created by Anton Piruev in 2026.
// Any direct commercial use of derivative work is strictly prohibited.

/**
 * How a device shows the SDF world (plan.md 22.1). The edit list is the
 * same everywhere; only its representation differs.
 */
export const enum SdfTier {
	/** WebGPU: bricks from compute shaders, cone marching. */
	Gpu = "A",
	/** WebGL2: ray marching a 3D atlas the CPU (or fragment passes) fill. */
	Gl = "B",
	/** Any API: the world as meshes (Surface Nets chunks). */
	Mesh = "C",
}

/** What the device offers (plan.md 22.5). */
export interface SdfCapabilities {
	WebGpu: boolean;
	WebGl2: boolean;
	/** MAX_3D_TEXTURE_SIZE (0 without 3D textures). */
	Max3dTextureSize: number;
	/** EXT_color_buffer_float: float render targets (cone marching). */
	ColorBufferFloat: boolean;
}

export interface TierChoiceOptions {
	/** The tiers this build can draw, best first. Default B, then C. */
	Available?: readonly SdfTier[];
	/**
	 * Milliseconds of a short ray-marching benchmark at 25% resolution
	 * (plan.md 22.5); over the budget, the device gets the mesh tier.
	 */
	BenchmarkMs?: number;
	/** The benchmark's budget. Default 4 ms. */
	BudgetMs?: number;
	/** The player's choice in the settings, if it is possible here. */
	Forced?: SdfTier;
}

export interface TierChoice {
	Tier: SdfTier;
	/** Why, for the debug screen and the logs. */
	Reason: string;
}

/** The smallest 3D texture the WebGL2 tier can work with (plan.md 5.2). */
export const MIN_ATLAS_SIZE = 256;

/** Whether a device can draw a tier at all. */
export function Supports( caps: SdfCapabilities, tier: SdfTier ): boolean {
	switch ( tier ) {
		case SdfTier.Gpu:
			return caps.WebGpu;
		case SdfTier.Gl:
			return caps.WebGl2 && caps.Max3dTextureSize >= MIN_ATLAS_SIZE;
		case SdfTier.Mesh:
			return true;
	}
}

/**
 * Picks the tier (plan.md 22.5, 23.7): the player's choice if the device
 * can do it, else the best available tier it supports - unless the
 * benchmark says ray marching is too slow here, then the mesh tier.
 */
export function ChooseTier(
	caps: SdfCapabilities,
	options: TierChoiceOptions = {},
): TierChoice {
	const available = options.Available ?? [ SdfTier.Gl, SdfTier.Mesh ];

	if ( options.Forced !== undefined
		&& available.includes( options.Forced )
		&& Supports( caps, options.Forced ) ) {
		return { Tier: options.Forced, Reason: "chosen in the settings" };
	}

	const slow = options.BenchmarkMs !== undefined
		&& options.BenchmarkMs > ( options.BudgetMs ?? 4 );

	for ( const tier of available ) {
		if ( tier === SdfTier.Mesh ) {
			break;
		}
		if ( !Supports( caps, tier ) ) {
			continue;
		}
		if ( slow ) {
			return {
				Tier: SdfTier.Mesh,
				Reason: `ray marching took ${ options.BenchmarkMs } ms`,
			};
		}
		return { Tier: tier, Reason: "supported" };
	}
	return { Tier: SdfTier.Mesh, Reason: "no ray-marching tier here" };
}

/** Reads the capabilities from a WebGL context (and whether WebGPU exists). */
export function DetectCapabilities(
	gl: WebGLRenderingContext | WebGL2RenderingContext | null,
	webGpu: boolean,
): SdfCapabilities {
	const webGl2 = gl !== null && "MAX_3D_TEXTURE_SIZE" in gl;

	return {
		WebGpu: webGpu,
		WebGl2: webGl2,
		Max3dTextureSize: webGl2
			? Number( gl.getParameter( gl.MAX_3D_TEXTURE_SIZE ) ) || 0
			: 0,
		ColorBufferFloat: gl?.getExtension( "EXT_color_buffer_float" ) != null,
	};
}
