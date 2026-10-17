// Created by Anton Piruev in 2026.
// Any direct commercial use of derivative work is strictly prohibited.

namespace CSEngine
{
	/// <summary>
	/// Base class of a component written in C#: the twin of the TypeScript Component (Core/Source/Engine/Core/
	/// Component.ts), with the same hooks in the same order. Put it on an entity in a scene manifest with
	/// <c>CSharp( "ClassName", { Field: value } )</c>; its public fields and properties get those values before Awake.
	/// <para>
	/// In each phase the C# components run after the TypeScript ones, in manifest order among themselves. C# and
	/// TypeScript components talk through <see cref="ScriptEngine.Stream"/> (the DataStream): publish and subscribe on
	/// tags, with plain classes, structs or records as messages.
	/// </para>
	/// </summary>
	public abstract class Component
	{
		/// <summary>The entity it is on (set before Awake).</summary>
		public Entity Entity { get; internal set; } = null!;

		/// <summary>Disabled components get no per-frame or per-step hooks (Awake, Start, OnDestroy still run).</summary>
		public bool Enabled { get; set; } = true;

		/// <summary>The engine: the DataStream, time, UI, log, the entities C# knows.</summary>
		public ScriptEngine Engine => Entity.Engine;

		public Transform Transform => Entity.Transform;

		/// <summary>Once, after the whole batch it was created with exists.</summary>
		public virtual void Awake()
		{
		}

		/// <summary>Once, before its first update.</summary>
		public virtual void Start()
		{
		}

		/// <summary>Every rendered frame, before <see cref="Update"/>.</summary>
		public virtual void OnInputUpdate( Input input, float dt )
		{
		}

		/// <summary>Every rendered frame.</summary>
		public virtual void Update( float dt )
		{
		}

		/// <summary>Every rendered frame, after <see cref="Update"/>: the place for HUD changes.</summary>
		public virtual void OnUIUpdate( float dt )
		{
		}

		/// <summary>Every physics step.</summary>
		public virtual void OnPhysicsUpdate( float dt )
		{
		}

		public virtual void OnCollisionEnter( Entity other )
		{
		}

		public virtual void OnCollisionExit( Entity other )
		{
		}

		public virtual void OnTriggerEnter( Entity other )
		{
		}

		public virtual void OnTriggerExit( Entity other )
		{
		}

		/// <summary>The entity was switched back on.</summary>
		public virtual void OnEnable()
		{
		}

		/// <summary>The entity was switched off.</summary>
		public virtual void OnDisable()
		{
		}

		/// <summary>Once, when it is destroyed with its entity.</summary>
		public virtual void OnDestroy()
		{
		}
	}
}