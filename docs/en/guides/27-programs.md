**English** | [Русский](../../ru/guides/27-programs.md)

# 27. Programs: applications without the engine

The **Program** template (genre *Application*) makes an application that doesn't use the engine at all, as a Windows
Forms one: a UI document for its window and `Program.ts` to start it. It is desktop only (Electron) and is built
straight into an `.exe`. The folders are a game's: `Content/`, `Resources/`, `Source/`, `Binaries/`.

```ts
// Source/Program.ts
import { Application } from "@cse/program";
import { MainForm } from "./MainForm";

export async function main(args: string[]): Promise<void> {
	await Application.Run(MainForm, "MainForm"); // the form's class, and its UI document's Id
}
```

```ts
// Source/MainForm.ts - the code behind Content/UI/MainForm.ui.json
import { Form } from "@cse/program";

export class MainForm extends Form {
	public override OnConstruct(): void {
		this.On("GreetButton", "click", () => this.SetText("GreetingLabel", "Hello!"));
	}
}
```

- A **form** is a `UiScript` (the UI Designer's code behind: `OnConstruct`, `OnLoad`, `OnShown`, `OnClosing`, `OnClosed`,
  `Widget`, `On`, `SetText`, `ShowDialog`, `MessageBox`...) with the program's services: `this.Settings` (the program's
  `SettingsStorage`, kept between runs), `this.Native` (the system's open and save dialogs and the files they pick, the
  window's title) and `this.Application`.
- **Application**: `Run(form, id)` shows the main form (closing it ends the program), `ShowForm(form, id)` another one,
  `Exit(code)`, `Args`, the `startup` and `exit` events.
- **Texts**: `Resources/*.cstables` (guide [docs/cstables.md](../../cstables.md)); the build generates
  `Source/Generated/CSTables.ts`.
- **Theme**: the project's `Ui.Theme` (Quasar's by default); `SetProgramTheme` changes it on the fly.
- The window's page reaches only the files the user picked in a dialog or the program was started with: never the rest
  of the disk.

## Building and running

In the Project Manager a program offers only the Desktop targets:

| | |
|---|---|
| **Run** - dev | the page from a dev server (hot reload) in the program's own window |
| **Build** - Desktop Dev / Prod | `Binaries/Desktop/<Dev|Prod>` (the page, `main.cjs`, `preload.cjs`) and, on Windows, `Binaries/Windows/<Dev|Prod>/<Name>.exe` |

The build is `@cse/program` (`Modules/Engine/Program`): `Build/vite.program.config.ts` in three passes - the page
(`App/`, with the project's documents and `Program.ts`), the Electron main process (`Shell/Main.ts`: one window, one
instance, the dialogs) and its preload (`Shell/Preload.ts`: `window.cseProgram`). No engine is in a program: nothing of
Babylon or the engine's workers (the smoke test and CI check the page's files).

`pnpm smoke:exe` (in `Programs/Desktop`, Windows) makes a project from the template, builds it into an .exe, runs it with
Windows' own PATH and an empty profile, and checks the program started (its main form shown): about 89 MB.
