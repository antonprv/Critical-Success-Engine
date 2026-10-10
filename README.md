# Critical Success Engine

Браузерный игровой движок: TypeScript + [Babylon.js](https://www.babylonjs.com/) для рендера, BEPU Physics (C#, собранный в WebAssembly) для физики, Vue 3 + Quasar для интерфейса. Каждая подсистема работает в своём воркере. Сборка - [Vite](https://vite.dev/), тесты - Vitest (юнит/интеграционные) и Playwright (в настоящем браузере).

Подробные руководства: [`docs/guides/00-index.md`](docs/guides/00-index.md).

## Требования

- [Node.js](https://nodejs.org/) 22.12+
- [pnpm](https://pnpm.io/) 10+ - единственный поддерживаемый пакетный менеджер
- для физики: .NET 10 SDK и workload `wasm-tools` (без неё игра запускается, но без физики)

## Установка

Веб-проект живёт в `src/CSEngine/Core`, все команды ниже - оттуда:

```bash
cd src/CSEngine          # the pnpm workspace: the engine and its modules
pnpm install
cd Core
```

## Разработка

```bash
pnpm dev
```

Dev-сервер Vite с hot reload на `http://127.0.0.1:5173`. Физику он берёт прямо из папки публикации .NET (см. ниже), так что после пересборки физики достаточно обновить страницу.

## Сборка

```bash
pnpm build        # продакшен-сборка в src/CSEngine/Binaries/Core (минификация, хэши, source maps)
pnpm build:dev    # с включёнными __DEV__-ветками (отладочные логи), без source maps
pnpm preview      # раздать готовую сборку на http://127.0.0.1:4173
pnpm rebuild      # очистка + продакшен-сборка
```

### Физика (WebAssembly)

```bash
cd devops && bash build-physics.sh      # Windows: build-physics.bat
```

Публикация кладёт рантайм в `src/CSEngine/Binaries/Physics/Release/net10.0/browser-wasm/AppBundle/_framework`. Оттуда его раздаёт `pnpm dev`, а `pnpm build` копирует в `Binaries/Core/physics-wasm/_framework`. Другую папку можно указать через переменную окружения `PHYSICS_WASM_DIR`. Подробности - в [`src/CSEngine/Physics/Bridge/BUILD.md`](src/CSEngine/Physics/Bridge/BUILD.md).

## Проверки и тесты

```bash
pnpm typecheck    # vue-tsc (исходники + .vue) и tsc для конфигов, сборочных скриптов и тестов
pnpm lint         # ESLint (typescript-eslint); pnpm lint:fix - с автоисправлением
pnpm test         # Vitest с покрытием; падает, если любой файл ниже 100% по любой метрике
pnpm test:e2e     # Playwright: собирает сайт и играет в него в Chromium, как пользователь
pnpm verify       # всё вышеперечисленное + сборка
```

Для `pnpm test:e2e` нужен браузер: один раз выполни `pnpm exec playwright install chromium`. Подробности о тестах - в [`docs/guides/01-getting-started.md`](docs/guides/01-getting-started.md).

## UI Toolkit

Отдельно от игры: 21 Vue-компонент в стиле Windows 98 - 7 (окна с рабочим столом и панелью задач, меню, списки, деревья, вкладки,
поля ввода, комбобоксы, полосы прокрутки, окна сообщений, подсказки...) в двух наборах оформления: Classic (12 тем Windows)
и Tailwind (26 акцентных и 9 нейтральных палитр Tailwind, светлый и тёмный режим, шкала радиусов).
У каждого элемента есть контроллер на чистом TypeScript: всё состояние в открытых полях, события с подпиской.
Демонстрация - `Modules/Engine/UI (pnpm dev в папке модуля)` (`http://127.0.0.1:5173/Modules/Engine/UI (pnpm dev в папке модуля)` при `pnpm dev`), описание - [`docs/guides/10-ui-toolkit.md`](docs/guides/10-ui-toolkit.md).

## Структура

```
src/
  CSEngine/
    Core/                  @cse/core - движок: игра, физика, рендер, модули
    Modules/
      Engine/UI/           @cse/ui - UI-модуль движка: тулкит, рантайм UI-документов, галерея
      Editor/UIDesigner/   @cse/ui-designer - редактор интерфейсов (тулинг, не часть игры)
    pnpm-workspace.yaml    одно рабочее пространство: движок и модули
  Templates/               шаблоны проектов (наполняются на этапе проектов)
```

## Редактор интерфейсов

Редакторный модуль `Modules/Editor/UIDesigner` (`pnpm dev` в его папке, затем `http://127.0.0.1:5175/`): интерфейс собирается мышью из палитры, сохраняется
ассетом `.ui.json` и оживает скриптом-классом (`UiScript`), который находит виджеты по именам из редактора - как
Widget Blueprint в Unreal. Модель форм как в Windows Forms (фокус, жизненный цикл, валидация по кнопке с контекстом,
`DialogResult`, `ShowDialog`), скины со спрайтами на 9 частей для каждого состояния и подключение своих Vue-виджетов.
Описание - [`docs/guides/11-ui-designer.md`](docs/guides/11-ui-designer.md).

## Ассеты

- Файлы, импортируемые из кода (`import url from "./rock.png"`, а также `.glb`, `.gltf`, `.babylon`, `.env`, `.dds`), Vite хэширует и кладёт в `assets/`.
- `src/CSEngine/Core/public/` копируется в сборку как есть: `public/assets/level.bin` будет доступен по адресу `/assets/level.bin`.

## CI

`.github/workflows/ci.yml` на каждый push/PR в `main`:

1. публикует физику в wasm;
2. ставит зависимости (`pnpm install --frozen-lockfile`);
3. прогоняет `typecheck`, `lint` и `test` с порогом покрытия;
4. собирает сайт;
5. запускает E2E, в том числе на настоящей wasm-физике.

Артефакты: сборка, отчёт о покрытии, а при падении - отчёт Playwright.

## Структура

```
src/CSEngine/Core/            - веб-проект (Vite)
  index.html                  - HTML-точка входа игры
  Modules/Engine/UI (pnpm dev в папке модуля)                - страница UI Toolkit
  Source/                     - исходный код (игра: Source/App.ts, UI Toolkit: Source/Toolkit)
  public/                     - статические файлы, копируются в сборку как есть
  Assets/index.css            - стили экрана первой загрузки
  BuildTools/                 - Vite-плагины: раздача/копирование физики, sidecar логов
  Tests/                      - Vitest
  E2E/                        - Playwright (спеки, сервер, подменный рантайм физики)
  vite.config.ts, vitest.config.ts, playwright.config.ts, tsconfig*.json, eslint.config.js
  Core.esproj                 - проект для Visual Studio
src/CSEngine/Physics/         - C#: BEPU Physics, интеграция и мост в JS (Bridge)
src/CSEngine/Binaries/        - результаты сборок (не хранится в git)
devops/                       - скрипты сборки физики
docs/                         - архитектура и руководства
.github/workflows/            - CI
```

## Открытие в IDE

`src/CSEngine/CSEngine.slnx` - в Visual Studio или JetBrains Rider; репозиторий также можно открыть папкой в VS Code (есть задачи запуска Vite и отладки в браузере).
