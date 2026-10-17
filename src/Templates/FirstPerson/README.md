# TemplateProject

Created from the First Person template: A first-person character in a test room: running, jumping, slopes, stairs, moving platforms, shooting.
Edit its UI documents with the UI Designer (Content/UI/Ui.manifest.json); write the game in Source/.

Components are written in TypeScript or C#, side by side: Source/Scripts/TriggerTally.cs is C# (the project's C# scripts
are TemplateProject.csproj; the engine builds them). C# and TypeScript talk through the DataStream
(`this.Engine.Stream` / `Engine.Stream`): tags and plain data, no references to each other.
