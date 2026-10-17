# TemplateProject

Created from the Blank template. Open the project in the engine's tools; edit its UI documents with the UI Designer
(they are listed in Content/UI/Ui.manifest.json); write the game in Source/.

Components are written in TypeScript or C#, side by side: Source/Scripts/LandingToast.ts and Source/Scripts/BallWatcher.cs
(the project's C# scripts are TemplateProject.csproj; the engine builds them). They talk through the DataStream
(`this.Engine.Stream` / `Engine.Stream`): tags and plain data, no references to each other.
