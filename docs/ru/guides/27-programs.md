[English](../../en/guides/27-programs.md) | **Русский**

# 27. Программы: приложения без движка

Шаблон **Program** (жанр *Application*) делает приложение, которое вообще не использует движок, как в Windows Forms:
UI-документ для окна и `Program.ts` для запуска. Только десктоп (Electron), сборка сразу в `.exe`. Структура папок как у
игр: `Content/`, `Resources/`, `Source/`, `Binaries/`.

```ts
// Source/Program.ts
import { Application } from "@cse/program";
import { MainForm } from "./MainForm";

export async function main(args: string[]): Promise<void> {
	await Application.Run(MainForm, "MainForm"); // класс формы и Id её UI-документа
}
```

```ts
// Source/MainForm.ts — код за Content/UI/MainForm.ui.json
import { Form } from "@cse/program";

export class MainForm extends Form {
	public override OnConstruct(): void {
		this.On("GreetButton", "click", () => this.SetText("GreetingLabel", "Привет!"));
	}
}
```

- **Форма** — это `UiScript` (код за документом из UIDesigner: `OnConstruct`, `OnLoad`, `OnShown`, `OnClosing`,
  `OnClosed`, `Widget`, `On`, `SetText`, `ShowDialog`, `MessageBox`...) плюс сервисы программы: `this.Settings`
  (`SettingsStorage` программы, сохраняется между запусками), `this.Native` (системные диалоги открытия и сохранения,
  выбранные в них файлы, заголовок окна) и `this.Application`.
- **Application**: `Run(form, id)` показывает главную форму (её закрытие завершает программу), `ShowForm(form, id)` —
  другую, `Exit(code)`, `Args`, события `startup` и `exit`.
- **Тексты**: `Resources/*.cstables` (см. [docs/cstables.md](../../cstables.md)); сборка генерирует
  `Source/Generated/CSTables.ts`.
- **Тема**: `Ui.Theme` проекта (по умолчанию Quasar); `SetProgramTheme` меняет её на лету.
- Странице окна доступны только файлы, выбранные пользователем в диалоге или переданные при запуске, остальной диск —
  нет.

## Сборка и запуск

В менеджере проектов у программы только цели Desktop:

| | |
|---|---|
| **Run** — dev | страница с dev-сервера (горячая перезагрузка) в собственном окне программы |
| **Build** — Desktop Dev / Prod | `Binaries/Desktop/<Dev|Prod>` (страница, `main.cjs`, `preload.cjs`) и на Windows `Binaries/Windows/<Dev|Prod>/<Имя>.exe` |

Сборка — `@cse/program` (`Modules/Engine/Program`): `Build/vite.program.config.ts` в три прохода — страница (`App/`, с
документами проекта и его `Program.ts`), main-процесс Electron (`Shell/Main.ts`: одно окно, один экземпляр, диалоги) и
его preload (`Shell/Preload.ts`: `window.cseProgram`). Движка в программе нет: ни Babylon, ни воркеров движка (это
проверяют smoke-тест и CI по файлам страницы).

`pnpm smoke:exe` (в `Programs/Desktop`, Windows) создаёт проект из шаблона, собирает его в .exe, запускает с системным
PATH Windows и пустым профилем и проверяет, что программа стартовала (главная форма показана): около 89 МБ.
