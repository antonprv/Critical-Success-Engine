// Created by Anton Piruev in 2026.
// Any direct commercial use of derivative work is strictly prohibited.

import { OverlapEvent } from "@cse/scripting";
import { Component } from "../Core/Component";
import type { Entity } from "../Core/Entity";
import { Comp, type ComponentManifest } from "../Core/EntityManifest";
import { Logger } from "../../Logging/Logger";

/**
 * A component written in C# (a subclass of CSEngine.Component in the project's
 * scripts), on an entity like any other: `CSharp( "Coin", { Value: 5 } )`. This
 * TypeScript side forwards the entity's lifecycle and events to it; the C#
 * component's per-frame hooks run in each phase after the TypeScript
 * components'. It reaches TypeScript through the DataStream
 * (`this.Engine.Stream`), as TypeScript reaches it.
 */
export class CSharpComponent extends Component {
	/** The C# class: its name, or its full name when two share one. */
	public Class = "";

	/** Values for its public fields and properties, set before Awake. */
	public Fields: Record<string, unknown> = {};

	private _id = 0;

	/** The C# component's id in the script runtime (0: none). */
	public get ScriptId(): number {
		return this._id;
	}

	public override Awake(): void {
		const scripts = this.Engine.Scripts;

		if ( !scripts ) {
			Logger.LogError(
				`[CSharp] "${ this.Class }" on "${ this.Entity.Name }" is a C# `
					+ "component, but the project's C# scripts are not loaded "
					+ "(no .csproj, or it failed to build or load).",
			);
			return;
		}
		this._id = scripts.Create(
			this.Entity.Id,
			this.Entity.Name,
			this.Class,
			this.Fields,
		);
		scripts.Awake( this._id );
	}

	public override Start(): void {
		this.Forward( ( scripts, id ) => scripts.Start( id ) );
	}

	public override OnTriggerEnter( other: Entity ): void {
		this.Event( OverlapEvent.TriggerEnter, other );
	}

	public override OnTriggerExit( other: Entity ): void {
		this.Event( OverlapEvent.TriggerExit, other );
	}

	public override OnCollisionEnter( other: Entity ): void {
		this.Event( OverlapEvent.CollisionEnter, other );
	}

	public override OnCollisionExit( other: Entity ): void {
		this.Event( OverlapEvent.CollisionExit, other );
	}

	public override OnEnable(): void {
		this.Forward( ( scripts, id ) => scripts.SetEnabled( id, true ) );
	}

	public override OnDisable(): void {
		this.Forward( ( scripts, id ) => scripts.SetEnabled( id, false ) );
	}

	public override OnDestroy(): void {
		this.Forward(
			( scripts, id ) => scripts.Destroy( id, this.Entity.Id ),
		);
		this._id = 0;
	}

	private Event( kind: OverlapEvent, other: Entity ): void {
		this.Forward(
			( scripts, id ) => scripts.Event( id, kind, other.Id, other.Name ),
		);
	}

	private Forward(
		action: (
			scripts: NonNullable<CSharpComponent["Engine"]["Scripts"]>,
			id: number,
		) => void,
	): void {
		const scripts = this.Engine.Scripts;

		if ( scripts && this._id !== 0 ) {
			action( scripts, this._id );
		}
	}
}

/**
 * A C# component for a manifest: `CSharp( "Spinner", { Speed: 2 } )` - the
 * class by name, its fields by value (plain data).
 */
export function CSharp(
	className: string,
	fields: Record<string, unknown> = {},
): ComponentManifest {
	return Comp( CSharpComponent, { Class: className, Fields: fields } );
}
