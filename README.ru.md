[English](README.md) | **Русский**

# Critical Success Engine

Браузерный игровой движок: TypeScript + [Babylon.js](https://www.babylonjs.com/) для рендера, BEPU Physics (C#, собранный в WebAssembly) для физики, Vue 3 + Quasar для интерфейса. Каждая подсистема работает в своём воркере. Сборка - [Vite](https://vite.dev/), тесты - Vitest (юнит/интеграционные) и Playwright (в настоящем браузере).

Подробные руководства: [`docs/ru/guides/00-index.md`](docs/ru/guides/00-index.md).

## Требования

- [Node.js](https://nodejs.org/) 22.12+
- [pnpm](https://pnpm.io/) 10+ - единственный поддерживаемый пакетный менеджер
- для физики (необязательно): .NET 10 SDK и workload `wasm-tools` (без неё игра запускается, но без физики; для Project Manager она не нужна)

## Быстрый старт: Project Manager (Electron)

Инструменты редактора - Project Manager и UI Designer - работают как десктопная программа. Скрипты из [`devops/`](devops) проверяют версии Node и pnpm, ставят зависимости, собирают всё нужное и запускают программу.

Bash:

```bash
bash devops/build-all.sh --skip-physics   # установить зависимости и собрать
bash devops/start-desktop.sh              # запустить Project Manager
```

PowerShell:

```powershell
pwsh devops/build-all.ps1 -SkipPhysics
pwsh devops/start-desktop.ps1
```

`--skip-physics` подходит для самой утилиты, но проекты, которые вы запускаете из неё кнопкой **Run**, берут физику из её сборки: если хотите, чтобы в них была физика, уберите флаг (нужен .NET SDK).

После первой сборки достаточно `start-desktop`; `--build` (`-Build`) пересоберёт перед запуском, `--designer` (`-Designer`) откроет UI Designer отдельно. Бинарник Electron скачивается при первом запуске.

- [`docs/ru/devops-commands.md`](docs/ru/devops-commands.md) - все скрипты и их параметры (в том числе `--web` для сборки веб-игры и сборка физики).
- [`docs/ru/manual-build.md`](docs/ru/manual-build.md) - ручная сборка по шагам: зависимости, dev-сервер, веб-игра, физика (wasm), десктопная программа, проверки.
- [`docs/ru/guides/16-desktop.md`](docs/ru/guides/16-desktop.md) - как устроены десктопная программа и Project Manager, включая создание проекта из шаблона и **Run** / **Build** проекта (Web или Desktop, Dev или Prod, в `Binaries/` проекта).

## Сборка и запуск веб-игры

Веб-игра (`src/CSEngine/Core`) и физика собираются вручную или командой `bash devops/build-all.sh --web`. См. [`docs/ru/manual-build.md`](docs/ru/manual-build.md): установка зависимостей, `pnpm dev` (dev-сервер с hot reload на `http://127.0.0.1:5173`), `pnpm build`, сборка рантайма физики в wasm.

## Проверки и тесты

Выполняются в `src/CSEngine/Core`:

```bash
pnpm verify       # typecheck + lint + тесты (покрытие 100%) + сборка + E2E
```

Отдельные команды (`pnpm typecheck`, `pnpm lint`, `pnpm test`, `pnpm test:e2e`) и разовая установка браузера для E2E - в [`docs/ru/manual-build.md`](docs/ru/manual-build.md). Подробности о тестах - в [`docs/ru/guides/01-getting-started.md`](docs/ru/guides/01-getting-started.md).

## UI Toolkit

Отдельно от игры: набор Vue-компонентов в стиле Windows 98 - 7 (окна с рабочим столом и панелью задач, меню, списки, деревья, вкладки, поля ввода, комбобоксы, полосы прокрутки, окна сообщений, подсказки...) в двух наборах оформления: Classic (12 тем Windows) и Tailwind (26 акцентных и 9 нейтральных палитр Tailwind, светлый и тёмный режим, шкала радиусов). У каждого элемента есть контроллер на чистом TypeScript: всё состояние в открытых полях, события с подпиской. Демонстрационная галерея - модуль `Modules/Engine/UI` (`pnpm dev` в папке модуля, затем `http://127.0.0.1:5176/`), описание - [`docs/ru/guides/10-ui-toolkit.md`](docs/ru/guides/10-ui-toolkit.md).

## Редактор интерфейсов

Редакторный модуль `Modules/Editor/UIDesigner` (проще всего открыть из Project Manager; отдельно - `pnpm dev` в его папке, затем `http://127.0.0.1:5175/`): интерфейс собирается мышью из палитры, сохраняется ассетом `.ui.json` и оживает скриптом-классом (`UiScript`), который находит виджеты по именам из редактора - как Widget Blueprint в Unreal. Модель форм как в Windows Forms (фокус, жизненный цикл, валидация по кнопке с контекстом, `DialogResult`, `ShowDialog`), скины со спрайтами на 9 частей для каждого состояния и подключение своих Vue-виджетов. Описание - [`docs/ru/guides/11-ui-designer.md`](docs/ru/guides/11-ui-designer.md).

## Ассеты

- Файлы, импортируемые из кода (`import url from "./rock.png"`, а также `.glb`, `.gltf`, `.babylon`, `.env`, `.dds`), Vite хэширует и кладёт в `assets/`.
- `src/CSEngine/Core/public/` копируется в сборку как есть: `public/assets/level.bin` будет доступен по адресу `/assets/level.bin`.

## CI

`.github/workflows/ci.yml` на каждый push/PR в `main`:

1. публикует физику в wasm;
2. ставит зависимости (`pnpm install --frozen-lockfile`);
3. прогоняет `typecheck`, `lint` и `test` с порогом покрытия;
4. собирает сайт;
5. запускает E2E, в том числе на настоящей wasm-физике;
6. собирает каждый шаблон, проверяет UI-модуль, UI Designer, Project Browser и десктопную программу.

Артефакты: сборка, отчёт о покрытии, а при падении - отчёт Playwright.

## Структура

```
src/
  CSEngine/                   рабочее пространство pnpm (pnpm-workspace.yaml): движок и модули
    Core/                     @cse/core - движок: игра, физика, рендер, модули (веб-проект, Vite)
      index.html              HTML-точка входа игры
      Source/                 исходный код (игра: Source/App.ts)
      public/                 статические файлы, копируются в сборку как есть
      Assets/index.css        стили экрана первой загрузки
      BuildTools/             Vite-плагины: раздача/копирование физики, проекты, sidecar логов
      Tests/                  Vitest
      E2E/                    Playwright (спеки, сервер, подменный рантайм физики)
      vite.config.ts, vitest.config.ts, playwright.config.ts, tsconfig*.json, eslint.config.js
      Core.esproj             проект для Visual Studio
    Modules/
      Engine/UI/              @cse/ui - UI-модуль движка: тулкит, рантайм UI-документов, галерея
      Editor/ProjectBrowser/  @cse/project-browser - Project Manager (модуль редактора)
      Editor/UIDesigner/      @cse/ui-designer - редактор интерфейсов (тулинг, не часть игры)
    Programs/Desktop/         @cse/desktop - десктопная программа (Electron) для инструментов редактора
    Physics/                  C#: BEPU Physics, интеграция и мост в JS (Bridge)
    Common/Math/              C#: FastMath
    Tools/                    вспомогательные утилиты (RetroTexturizer)
    Binaries/                 результаты сборок (не хранится в git)
  Templates/                  шаблоны проектов (Blank, FirstPerson, ThirdPerson, TopDown, CoinHunt)
devops/                       скрипты сборки и запуска (см. docs/ru/devops-commands.md)
docs/                         архитектура, руководства, ручная сборка (docs/en - английский, docs/ru - русский)
.github/workflows/            CI
```

## Открытие в IDE

`src/CSEngine/CSEngine.slnx` - в Visual Studio или JetBrains Rider; репозиторий также можно открыть папкой в VS Code (есть задачи запуска Vite и отладки в браузере).
