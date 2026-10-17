# TemplateProject

Created from the Third Person template: A character seen from behind in an arena: a camera arm that shortens against walls, and a distance HUD.
Edit its UI documents with the UI Designer (Content/UI/Ui.manifest.json); write the game in Source/.

Components are written in TypeScript or C#, side by side: Source/Scripts/WalkMilestones.cs is C# (the project's C# scripts
are TemplateProject.csproj; the engine builds them). C# and TypeScript talk through the DataStream
(`this.Engine.Stream` / `Engine.Stream`): tags and plain data, no references to each other.
