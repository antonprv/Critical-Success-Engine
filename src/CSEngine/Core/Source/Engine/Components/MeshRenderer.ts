// Created by Anton Piruev in 2026.
// Any direct commercial use of derivative work is strictly prohibited.

import type { MeshDescriptor } from "../../Workers/Protocol/RenderGameLogicProtocol";
import { Component } from "../Core/Component";
import type { Vec3Tuple } from "../Math/Vec3";

/**
 * Draws a mesh at the entity's transform. The mesh lives in the render worker; this component spawns it on Awake,
 * removes it on destroy, and the runtime streams the entity's (interpolated) pose to it every frame.
 */
export class MeshRenderer extends Component {
	public Mesh: MeshDescriptor | null = null;
	/** rgb 0..1 */
	public Color: Vec3Tuple = [0.75, 0.78, 0.82];
	public Visible = true;

	public override Awake(): void {
		if (!this.Mesh) return;

		this.Engine.Render.Spawn(this.Entity.Id, this.Mesh, this.Transform.ToFlat(), this.Color);
		if (!this.Visible) this.Engine.Render.SetVisible(this.Entity.Id, false);
		this.Engine.World.Renderables.set(this.Entity.Id, this.Entity);
	}

	public SetVisible(visible: boolean): void {
		if (this.Visible === visible) return;
		this.Visible = visible;
		if (this.Mesh) this.Engine.Render.SetVisible(this.Entity.Id, visible);
	}

	public SetColor(color: Vec3Tuple): void {
		this.Color = color;
		if (this.Mesh) this.Engine.Render.SetColor(this.Entity.Id, color);
	}

	public override OnEnable(): void {
		if (this.Mesh) this.Engine.Render.SetVisible(this.Entity.Id, this.Visible);
	}

	public override OnDisable(): void {
		if (this.Mesh) this.Engine.Render.SetVisible(this.Entity.Id, false);
	}

	public override OnDestroy(): void {
		if (!this.Mesh) return;
		this.Engine.Render.Remove(this.Entity.Id);
		this.Engine.World.Renderables.delete(this.Entity.Id);
	}
}
