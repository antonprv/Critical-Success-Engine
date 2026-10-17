// A component written in C#, on the trigger pad next to its TypeScript TriggerZone (Source/Scenes/CharacterTestScene.ts):
// it counts who stepped in and keeps the count on the HUD.

using CSEngine;

namespace TemplateProject;

public sealed class TriggerTally : Component
{
	/// <summary>The HUD line it writes (set from the scene).</summary>
	public string HudKey = "pad.tally";

	private int _entries;

	public override void Start() => Show();

	public override void OnTriggerEnter( Entity other )
	{
		_entries++;
		Show();
	}

	private void Show() => Engine.Ui.SetHud( HudKey, $"Trigger pad: entered {_entries} time{( _entries == 1 ? "" : "s" )}" );
}