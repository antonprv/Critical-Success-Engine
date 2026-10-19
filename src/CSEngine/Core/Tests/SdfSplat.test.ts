// Created by Anton Piruev in 2026.
// Any direct commercial use of derivative work is strictly prohibited.

import { SdfOp, SdfShape } from "@cse/sdf";
import { describe, expect, it } from "vitest";
import { Projectile } from "../Source/Engine/Components/Physics/Projectile";
import { SdfSplat } from "../Source/Engine/Components/Sdf/SdfSplat";
import { Comp, Ent } from "../Source/Engine/Core/EntityManifest";
import { SdfService } from "../Source/Engine/Services/SdfService";
import { PhysOpType, PhysState } from "../Source/Workers/Common/CommonEnums";
import type {
	PhysicsCommand,
} from "../Source/Workers/Protocol/PhysicsGameLogicProtocol";
import { MakeEngine } from "./engine";

const settle = async (): Promise<void> => {
	await Promise.resolve();
	await Promise.resolve();
};

/** A splat flying from the origin, with an SDF service of its own. */
function Thrown() {
	const t = MakeEngine();
	const sdf = new SdfService( null );

	sdf.Load( null );
	Object.assign( t.engine, { Sdf: sdf } );

	const entity = t.world.Spawn( Ent( "Splat", [
		Comp( Projectile, { Radius: 0.1 } ),
		Comp( SdfSplat, { Radius: 0.3, MaterialId: 2, Layer: 2, Mask: 2 } ),
	], { position: [ 0, 1, 0 ] } ) );

	t.world.FlushLifecycle();
	return { t, sdf, entity, splat: entity.GetComponent( SdfSplat )! };
}

describe( "SdfSplat", () => {
	it( "flies as a blob of the world, stretched along its flight", () => {
		const { t, sdf, entity } = Thrown();
		const blob = sdf.Dynamic.Edits[0]!;

		// one dynamic edit, on its layer, merging with what its mask has
		expect( sdf.Dynamic.Count ).toBe( 1 );
		expect( blob ).toMatchObject( {
			Shape: SdfShape.Ellipsoid,
			Op: SdfOp.SmoothUnion,
			Position: [ 0, 1, 0 ],
			MaterialId: 2,
			Layer: 2,
			Mask: 2,
		} );

		// at rest: round, upright
		t.frame();
		expect( sdf.Dynamic.Edits[0]!.Params[1] ).toBeCloseTo( 0.3, 6 );
		expect( sdf.Dynamic.Edits[0]!.Rotation ).toEqual( [ 0, 0, 0, 1 ] );

		// flying along -Z at 10 m/s: longer that way, thinner across
		entity.GetComponent( Projectile )!.Velocity.Set( 0, 0, -10 );
		entity.Transform.Position.Set( 0, 1, -2 );
		t.frame();

		const [ across, along ] = sdf.Dynamic.Edits[0]!.Params;

		expect( along ).toBeCloseTo( 0.3 * 1.3, 6 );
		expect( across! * across! * along! ).toBeCloseTo( 0.3 ** 3, 6 );
		expect( sdf.Dynamic.Edits[0]!.Position ).toEqual( [ 0, 1, -2 ] );
		expect( sdf.Dynamic.Edits[0]!.Rotation[3] )
			.toBeCloseTo( Math.SQRT1_2, 6 );
	} );

	it( "sticks where it hits and stops being a blob", async () => {
		const { t, sdf, entity } = Thrown();

		entity.GetComponent( Projectile )!.Velocity.Set( 0, 0, -10 );
		t.step();
		physicsSweep( t ).forEach( ( query ) => t.physics.HandleMessage( {
			state: PhysState.QueryResult,
			queryId: query.queryId,
			result: {
				hit: true,
				position: [ 0, 1, -0.9 ],
				point: [ 0, 1, -1 ],
				normal: [ 0, 0, 1 ],
				hitEntityId: 0,
			} as never,
		} ) );
		await settle();
		t.world.FlushDestroyed();

		// an edit flattened against the wall, on its layer
		expect( sdf.Edits.Count ).toBe( 1 );
		expect( sdf.Edits.Edits[0] ).toMatchObject( {
			Shape: SdfShape.Ellipsoid,
			MaterialId: 2,
			Layer: 2,
			Mask: 2,
		} );
		// a carving one would have left a crater
		expect( sdf.Edits.Edits[0]!.Op ).toBe( SdfOp.SmoothUnion );
		// the projectile gone, and its blob with it
		expect( entity.IsDestroyed ).toBe( true );
		expect( sdf.Dynamic.Count ).toBe( 0 );
	} );

	it(
		"hides while switched off (back in a pool) and flies again after",
		() => {
			const { t, sdf, entity, splat } = Thrown();

			// switched on while already flying: still one blob
			splat.OnEnable();
			expect( sdf.Dynamic.Count ).toBe( 1 );
			entity.Active = false;
			expect( sdf.Dynamic.Count ).toBe( 0 );
			// nothing to move meanwhile
			splat.Update();
			expect( sdf.Dynamic.Count ).toBe( 0 );
			entity.Active = true;
			t.world.FlushLifecycle();
			expect( sdf.Dynamic.Count ).toBe( 1 );
			entity.Destroy();
			t.world.FlushDestroyed();
			expect( sdf.Dynamic.Count ).toBe( 0 );
			// gone already: nothing more to take away
			splat.OnDestroy();
			expect( sdf.Dynamic.Count ).toBe( 0 );
		},
	);
} );

function physicsSweep( t: ReturnType<typeof MakeEngine> ) {
	return t.commands().filter(
		( c ): c is Extract<
			PhysicsCommand,
			{ operation: PhysOpType.Query; }
		> => (
			c.operation === PhysOpType.Query
		),
	);
}

describe( "SdfSplat carving", () => {
	it( "takes matter away where it hits", async () => {
		const { t, sdf, entity } = Thrown();

		entity.GetComponent( SdfSplat )!.Carve = true;
		entity.GetComponent( Projectile )!.Velocity.Set( 0, 0, -10 );
		t.step();
		physicsSweep( t ).forEach( ( query ) => t.physics.HandleMessage( {
			state: PhysState.QueryResult,
			queryId: query.queryId,
			result: {
				hit: true,
				position: [ 0, 1, -0.9 ],
				point: [ 0, 1, -1 ],
				normal: [ 0, 0, 1 ],
				hitEntityId: 0,
			} as never,
		} ) );
		await settle();
		expect( sdf.Edits.Edits[0]!.Op ).toBe( SdfOp.SmoothSubtract );
	} );
} );
