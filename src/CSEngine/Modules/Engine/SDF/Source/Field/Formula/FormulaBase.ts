// Created by Anton Piruev in 2026.
// Any direct commercial use of derivative work is strictly prohibited.

import type { SdfBaseLayer } from "../BaseLayers";
import {
	FormulaFrameValues,
	FormulaGlsl,
	FormulaParamValues,
} from "./FormulaGlsl";
import {
	CompileFormulaJs,
	FrameOf,
	type FormulaField,
	type FractalFrame,
	type FractalFrameOptions,
} from "./FormulaJs";
import {
	FormulaError,
	ParseFormula,
	type FormulaProgram,
} from "./FormulaLanguage";

/** A formula's parameter values by name: a number, or three. */
export type FormulaParams = Readonly<
	Record<string, number | readonly number[]>
>;

/** A fractal written as a formula (FormulaLanguage), as data. */
export interface FormulaBaseOptions {
	Source: string;
	/** Values over the formula's defaults. */
	Params?: FormulaParams;
	Frame?: FractalFrameOptions;
}

/**
 * The world's base as a formula (S6-26, the formula editor): parsed and
 * checked once, compiled to JavaScript for the CPU (meshing, physics,
 * rays) and to GLSL for the GPU (Glsl, ParamValues, FrameValues: the same
 * field on both). Throws a FormulaError with the place of what is wrong.
 */
export class FormulaBase implements SdfBaseLayer {
	public readonly Program: FormulaProgram;

	public readonly Frame: FractalFrame;

	/** Every parameter's value (the defaults, then what was given). */
	public readonly Params: ReadonlyMap<string, readonly number[]>;

	public readonly MaterialId: number;

	public readonly MaterialB: number;

	public MaterialMix = 0;

	private readonly _field: FormulaField;

	private readonly _out = new Float64Array( 1 );

	private _glsl: string | null = null;

	public constructor( public readonly Options: FormulaBaseOptions ) {
		this.Program = ParseFormula( Options.Source );
		this.Frame = FrameOf( Options.Frame );
		this.Params = ResolveParams( this.Program, Options.Params ?? {} );
		this.MaterialId = this.Frame.Materials[0];
		this.MaterialB = this.Frame.Materials[1];
		this._field = CompileFormulaJs( this.Program, this.Params, this.Frame );
	}

	public Distance( x: number, y: number, z: number, detail = 0 ): number {
		const d = this._field( x, y, z, detail, this._out );

		this.MaterialMix = this._out[0]!;
		return d;
	}

	/** The formula in GLSL (FormulaGlsl), made the first time. */
	public get Glsl(): string {
		this._glsl ??= FormulaGlsl( this.Program );
		return this._glsl;
	}

	/** sdfFormulaParams' values. */
	public ParamValues(): Float32Array {
		return FormulaParamValues( this.Program, this.Params );
	}

	/** sdfFormulaFrame's values. */
	public FrameValues(): Float32Array {
		return FormulaFrameValues( this.Frame );
	}
}

/** The defaults with the given values over them; checks names and sizes. */
function ResolveParams(
	program: FormulaProgram,
	given: FormulaParams,
): Map<string, readonly number[]> {
	const params = new Map<string, readonly number[]>();

	for ( const param of program.Params ) {
		params.set( param.Name, param.Default );
	}
	for ( const [ name, value ] of Object.entries( given ) ) {
		const param = program.Params.find( ( it ) => it.Name === name );
		const values = typeof value === "number" ? [ value ] : [ ...value ];

		if ( !param ) {
			throw new FormulaError(
				`the formula has no parameter '${ name }'`,
				{ Line: 1, Column: 1 },
			);
		}
		if ( values.length !== param.Default.length ) {
			throw new FormulaError(
				`'${ name }' takes ${ param.Default.length } number(s)`,
				param.Pos,
			);
		}
		params.set( name, values );
	}
	return params;
}
