# TemplateProject

Created from the Program template: an application without the engine, as a Windows Forms one. Desktop only (Electron),
built straight into an .exe.

- `Source/Program.ts` - `main(args)`: picks the language and runs the main form (`Application.Run(MainForm, "MainForm")`).
- `Content/UI/MainForm.ui.json` - the main form's window: edit it in the UI Designer (it is listed in
  `Content/UI/Ui.manifest.json`).
- `Source/MainForm.ts` - the code behind it (a `Form`: `OnConstruct`, `OnShown`, `OnClosing`...): its widgets' events,
  the program's settings (`this.Settings`), the system's dialogs and the files they pick (`this.Native`).
- `Resources/UiNames.cstables` - the texts (Russian), `UiNames.en.cstables` their English; the build generates
  `Source/Generated/CSTables.ts` (`CSTables.UiNames.Greet`...).

In the Project Manager: **Run** (dev) opens the program in a window, **Build** makes `Binaries/Windows/<Dev|Prod>/
TemplateProject.exe`.
