// Created by Anton Piruev in 2026.
// Any direct commercial use of derivative work is strictly prohibited.

// What moves in the demo's grass and splat scenes: balls rolling over the
// grass (they press it as any mesh of the scene does) and a thrower of
// splats at a wall (in flight dynamic edits, where they land edits).

import { StandardMaterial } from "@babylonjs/core/Materials/standardMaterial";
import { Color3 } from "@babylonjs/core/Maths/math.color";
import { CreateSphere } from "@babylonjs/core/Meshes/Builders/sphereBuilder";
import type { Mesh } from "@babylonjs/core/Meshes/mesh";
import type { Scene } from "@babylonjs/core/scene";
import {
	SdfOp,
	SdfShape,
	SplatEdit,
	RotationFromY,
	type SdfDynamicEdits,
	type SdfWorld,
} from "../Source/Index";

/**
 * Balls rolling on loops over the grass, resting on the ground at `ground`:
 * a ball turns as it rolls, and what it rolls over lies down behind it.
 */
export class RollingBalls {
	public readonly Balls: Mesh[] = [];

	private _time = 0;

	public constructor(
		scene: Scene,
		count: number,
		private readonly _ground: number,
	) {
		const material = new StandardMaterial( "ball", scene );

		material.diffuseColor = new Color3( 0.9, 0.45, 0.2 );
		for ( let i = 0; i < count; i++ ) {
			const ball = CreateSphere(
				`ball ${ i }`,
				{ diameter: 0.6, segments: 16 },
				scene,
			);

			ball.material = material;
			this.Balls.push( ball );
		}
		this.Update( 0 );
	}

	/** Where ball `i` is at time `t`: on a loop of its own. */
	public static Path( i: number, t: number ): [ number, number ] {
		const radius = 1.5 + i * 0.9;
		const angle = t * ( 0.9 - i * 0.12 ) + i * 2.1;

		return [ Math.cos( angle ) * radius, Math.sin( angle ) * radius * 0.7 ];
	}

	public Update( dt: number ): void {
		this._time += dt;
		this.Balls.forEach( ( ball, i ) => {
			const [ x, z ] = RollingBalls.Path( i, this._time );
			const [ px, pz ] = RollingBalls.Path( i, this._time - 0.05 );

			ball.position.set( x, this._ground + 0.3, z );
			// rolling: about the axis across its way, its path over its radius
			ball.rotation.x += ( z - pz ) / 0.3;
			ball.rotation.z -= ( x - px ) / 0.3;
		} );
	}
}

interface Flying {
	Id: number;
	Position: [ number, number, number ];
	Velocity: [ number, number, number ];
	Layer: number;
	Mask: number;
	Material: number;
}

/**
 * Throws splats at whatever stands in front of `from` along +X: each a
 * dynamic edit in flight (a blob stretched along its way), an edit where it
 * lands. Every other one is of layer 2 merging only with layer 2: it sticks
 * to the wall with a hard seam, the others melt into it.
 */
export class SplatThrower {
	/** Splats that landed. */
	public Landed = 0;

	private readonly _flying: Flying[] = [];

	private _timer = 0;

	private _thrown = 0;

	public constructor(
		private readonly _world: SdfWorld,
		private readonly _dynamic: SdfDynamicEdits,
		private readonly _from: [ number, number, number ],
		/** Seconds between two throws. */
		private readonly _every = 0.12,
		private readonly _radius = 0.22,
		/**
		 * The splats take matter away where they hit (craters), aimed at three
		 * spots of the wall in turn: each drilled through after a few.
		 */
		private readonly _carve = false,
	) {
	}

	public Update( dt: number ): void {
		this._timer += dt;
		while ( this._timer >= this._every && this._flying.length < 15 ) {
			this._timer -= this._every;
			this.Throw();
		}
		for ( const splat of [ ...this._flying ] ) {
			this.Fly( splat, dt );
		}
	}

	private Throw(): void {
		const n = this._thrown++;
		// a spread over the wall, the same every run
		const spread = ( k: number ): number => ( ( n * k ) % 97 ) / 97 - 0.5;
		const stuck = !this._carve && n % 2 === 1;
		// carving: at (wall face, 1.5, -1.5 | 0 | 1.5), a little scattered; a
		// lob of 0.73 s at 9 m/s (the wall's face 6.6 m away)
		const spot = ( n % 3 ) - 1;
		const velocity: [ number, number, number ] = this._carve
			? [
				9,
				4.3 + spread( 37 ) * 0.3,
				( spot * 1.5 ) / 0.73 + spread( 53 ) * 0.3,
			]
			: [ 9, 3 + spread( 37 ) * 2.4, spread( 53 ) * 5 ];
		const splat: Flying = {
			Id: 0,
			Position: [ ...this._from ],
			Velocity: velocity,
			Layer: stuck ? 2 : 1,
			Mask: stuck ? 2 : 0xff,
			Material: this._carve ? 1 : stuck ? 5 : 2,
		};

		splat.Id = this._dynamic.Add( {
			Shape: SdfShape.Ellipsoid,
			Op: SdfOp.SmoothUnion,
			Position: splat.Position,
			Params: [ this._radius, this._radius, this._radius, 0 ],
			SmoothK: this._radius * 0.6,
			MaterialId: splat.Material,
			Layer: splat.Layer,
			Mask: splat.Mask,
		} ).Id;
		this._flying.push( splat );
	}

	private Fly( splat: Flying, dt: number ): void {
		const p = splat.Position;
		const field = this._world.Field;
		// steps no longer than half its radius: it never flies through a wall
		const speed0 = Math.hypot( ...splat.Velocity );
		const steps = Math.max(
			1,
			Math.ceil( speed0 * dt / ( this._radius * 0.5 ) ),
		);
		let d = Infinity;

		for ( let s = 0; s < steps && d > this._radius * 0.5; s++ ) {
			const step = dt / steps;

			splat.Velocity[1] -= 9.81 * step;
			p[0] += splat.Velocity[0] * step;
			p[1] += splat.Velocity[1] * step;
			p[2] += splat.Velocity[2] * step;
			d = field.Distance( p[0], p[1], p[2] );
		}

		const [ vx, vy, vz ] = splat.Velocity;

		if ( d <= this._radius * 0.5 || p[1] < -2 ) {
			this._dynamic.Remove( splat.Id );
			this._flying.splice( this._flying.indexOf( splat ), 1 );
			if ( p[1] >= -2 ) {
				const normal = field.Normal( p[0], p[1], p[2], 0.05 );

				this._world.Add( SplatEdit( {
					Position: [
						p[0] - normal[0] * d,
						p[1] - normal[1] * d,
						p[2] - normal[2] * d,
					],
					Normal: normal,
					Radius: this._radius,
					MaterialId: splat.Material,
					Layer: splat.Layer,
					Mask: splat.Mask,
					Carve: this._carve,
				} ) );
				this.Landed++;
			}
			return;
		}

		// stretched along its way
		const speed = Math.hypot( vx, vy, vz );
		const along = this._radius * ( 1 + speed * 0.03 );
		const across = this._radius * Math.sqrt( this._radius / along );

		this._dynamic.Update( splat.Id, {
			Position: [ ...p ],
			Rotation: RotationFromY( vx / speed, vy / speed, vz / speed ),
			Params: [ across, along, across, 0 ],
		} );
	}
}
