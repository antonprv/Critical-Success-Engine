# TemplateProject

Created from the Top-Down template: Seen from above at a fixed angle: walk onto the pad in every corner; the HUD counts them.
Edit its UI documents with the UI Designer (Content/UI/Ui.manifest.json); write the game in Source/.

Components are written in TypeScript or C#, side by side: Source/Scripts/VisitTimer.cs is C# and Source/Scripts/Pads.ts, which it listens to (the project's C# scripts
are TemplateProject.csproj; the engine builds them). C# and TypeScript talk through the DataStream
(`this.Engine.Stream` / `Engine.Stream`): tags and plain data, no references to each other.
