// Created by Anton Piruev in 2026.
// Any direct commercial use of derivative work is strictly prohibited.

import {
	ALL_LAYERS,
	SdfOp,
	SdfShape,
} from "@cse/sdf";
import { Component } from "../../Core/Component";

/**
 * An entity drawn as a shape of the SDF world: a dynamic edit that follows
 * its transform every frame - a cube pushed around by the physics, a blob
 * shot at it - melting into what it touches where its mask has that layer
 * (the floor, with SmoothUnion: a fillet that slides along with it). Give
 * the entity a body of the same size for the physics.
 */
export class SdfBody extends Component {
	public Shape = SdfShape.RoundBox;

	/** The shape's sizes, as an edit's Params. */
	public Params: [ number, number, number, number ] = [ 0.5, 0.5, 0.5, 0.08 ];

	public Op = SdfOp.SmoothUnion;

	/** The blend with what it meets. */
	public SmoothK = 0.3;

	public MaterialId = 0;

	public Layer = 1;

	public Mask = ALL_LAYERS;

	private _edit = 0;

	public override Start(): void {
		this.Show();
	}

	public override OnEnable(): void {
		this.Show();
	}

	public override Update(): void {
		if ( this._edit === 0 ) {
			return;
		}
		this.Engine.Sdf.UpdateDynamic( this._edit, {
			Position: this.Transform.Position.ToTuple(),
			Rotation: this.Transform.Rotation.ToTuple(),
		} );
	}

	public override OnDisable(): void {
		this.Hide();
	}

	public override OnDestroy(): void {
		this.Hide();
	}

	private Show(): void {
		if ( this._edit !== 0 ) {
			return;
		}
		this._edit = this.Engine.Sdf.AddDynamic( {
			Shape: this.Shape,
			Op: this.Op,
			Position: this.Transform.Position.ToTuple(),
			Rotation: this.Transform.Rotation.ToTuple(),
			Params: [ ...this.Params ],
			SmoothK: this.SmoothK,
			MaterialId: this.MaterialId,
			Layer: this.Layer,
			Mask: this.Mask,
		} ).Id;
	}

	private Hide(): void {
		if ( this._edit !== 0 ) {
			this.Engine.Sdf.RemoveDynamic( this._edit );
			this._edit = 0;
		}
	}
}
