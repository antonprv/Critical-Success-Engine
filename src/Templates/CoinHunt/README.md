# TemplateProject

Created from the Coin Hunt template: A small collect-them-all game: coins to grab before the clock runs out, spinning hazards, a restart.
Edit its UI documents with the UI Designer (Content/UI/Ui.manifest.json); write the game in Source/.

Components are written in TypeScript or C#, side by side: Source/Scripts/StreakTracker.cs is C# and Source/Scripts/CoinHunt.ts, which it listens to (the project's C# scripts
are TemplateProject.csproj; the engine builds them). C# and TypeScript talk through the DataStream
(`this.Engine.Stream` / `Engine.Stream`): tags and plain data, no references to each other.
