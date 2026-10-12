**English** | [Русский](../../ru/guides/15-data-assets.md)

# 15. `.csedata` data files

Like ScriptableObject in Unity, but in JSON: **a class in code** says the type, the fields and their default values, and **a file**
supplies the values. The files aren't embedded in the build's code - they lie next to the game (`data/<Id>.csedata`), so they
can be edited **without a rebuild**: in a finished game on a host, and during development - in the project's folder (the dev server reads
them from disk on every request, an edit is visible after a page reload).

The code: `Core/Source/Engine/Data/DataAsset.ts`.

## The class

```ts
// Templates/CoinHunt/Source/Data/CoinHuntRules.ts
import { DataAsset } from "@cse/core/Engine/Data/DataAsset";

export class CoinHuntRules extends DataAsset {
	public static readonly AssetType = "CoinHuntRules";
	public TimeLimitSeconds = 60;
	public TimeLimitChoices = [30, 60, 90];
}
```

## The file

```json
{
  "FileVersion": 1,
  "Type": "CoinHuntRules",
  "Values": { "TimeLimitSeconds": 45, "TimeLimitChoices": [30, 45, 90] }
}
```

Fields that aren't in the file take the class's values. Errors name the file and the field: a foreign `Type`, an unknown field,
a value of the wrong kind (a number, a string, true/false, a list, an object - judged by the default value in the class), a file newer than
the engine. The build checks that the file is JSON; the fields are checked by the game against the class.

## In a project

The descriptor lists the files by Id:

```json
"Data": [{ "Id": "CoinHuntRules", "Path": "Content/Data/CoinHuntRules.csedata" }]
```

The game loads all of the project's data files at startup (they're small), and then reads them right away:

```ts
const rules = this.Engine.Data.Get(CoinHuntRules, "CoinHuntRules");          // the file is required
const view = this.Engine.Data.GetOrDefault(FirstPersonView, "FirstPersonView"); // without a file - the class's values
```

The instance is created once and shared. A file that failed to load is written to the log by name, and the game
starts; it will report itself again when the game asks for it.

## What the templates store

Project settings not related to input (input is in the input files, guide 14):

| Template | File | What's in it |
|---|---|---|
| Coin Hunt | `CoinHuntRules` | the default time limit, the limit options in the settings |
| First Person | `FirstPersonView` | the field of view: the value, the limits and the setting's step |
| Third Person | `ThirdPersonCamera` | the camera distance: the value, the limits and the setting's step |
| Top-Down | `TopDownCamera` | the zoom and its limits, the tilt near and far, the default edge scrolling |

The values from these files are where the player starts; what they chose themselves is stored by `SettingsStorage` (guide 14).
Games Sample lists the data files of all the templates.
