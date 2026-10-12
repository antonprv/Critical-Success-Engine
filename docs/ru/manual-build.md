[English](../en/manual-build.md) | **Русский**

# Ручная сборка

Здесь по шагам описано то, что за вас делают скрипты из `devops/`. Нужно, если вы хотите собирать отдельные части,
разбираетесь со сборкой или скрипты вам не подходят. Быстрый путь - в [README](../../README.ru.md) и в [devops-commands.md](devops-commands.md).

## Требования

- [Node.js](https://nodejs.org/) 22.12+
- [pnpm](https://pnpm.io/) 10+ - единственный поддерживаемый пакетный менеджер
- для физики: .NET 10 SDK и workload `wasm-tools` (`dotnet workload install wasm-tools`); без неё игра запускается, но без физики

## Установка зависимостей

Все пакеты - одно рабочее пространство pnpm в `src/CSEngine`:

```bash
cd src/CSEngine          # рабочее пространство pnpm: движок и его модули
pnpm install
```

## Веб-игра (Core)

Веб-проект живёт в `src/CSEngine/Core`, команды ниже выполняются оттуда:

```bash
cd src/CSEngine/Core
pnpm dev
```

Dev-сервер Vite с hot reload на `http://127.0.0.1:5173`. Физику он берёт прямо из папки публикации .NET (см. ниже), так что после пересборки физики достаточно обновить страницу.

```bash
pnpm build        # продакшен-сборка в src/CSEngine/Binaries/Core (минификация, хэши, source maps)
pnpm build:dev    # с включёнными __DEV__-ветками (отладочные логи), без source maps
pnpm preview      # раздать готовую сборку на http://127.0.0.1:4173
pnpm rebuild      # очистка + продакшен-сборка
```

## Физика (WebAssembly)

```bash
cd devops && bash build-physics.sh      # Windows: build-physics.bat
```

Скрипт нужно запускать именно из папки `devops` (пути внутри относительные). Публикация кладёт рантайм в `src/CSEngine/Binaries/Physics/Release/net10.0/browser-wasm/AppBundle/_framework`, а лог - в `devops/publish.log`. Оттуда рантайм раздаёт `pnpm dev`, а `pnpm build` копирует его в `Binaries/Core/physics-wasm/_framework`. Другую папку можно указать через переменную окружения `PHYSICS_WASM_DIR`. Подробности - в [`src/CSEngine/Physics/Bridge/BUILD.md`](../../src/CSEngine/Physics/Bridge/BUILD.md).

## Десктопное приложение: Project Manager и UI Designer (Electron)

Три шага по порядку (из корня репозитория, после `pnpm install`):

```bash
cd src/CSEngine/Modules/Editor/ProjectBrowser && pnpm build
cd src/CSEngine/Modules/Editor/UIDesigner && pnpm build
cd src/CSEngine/Programs/Desktop && pnpm build && pnpm start
```

Результат сборки лежит в `src/CSEngine/Binaries` (`Programs/Desktop/main.cjs`, `preload.cjs`, страницы модулей редактора). Бинарник Electron скачивается при первом запуске.

Для разработки страницы можно взять с dev-серверов Vite вместо собранных:

```bash
cd src/CSEngine/Modules/Editor/ProjectBrowser && pnpm dev    # http://127.0.0.1:5177/
cd src/CSEngine/Modules/Editor/UIDesigner && pnpm dev        # http://127.0.0.1:5175/
```

и запускать программу с переменными `CSE_PROJECT_BROWSER_URL=http://127.0.0.1:5177/` и `CSE_UI_DESIGNER_URL=http://127.0.0.1:5175/`. Дизайнер отдельно: `pnpm start -- --ui-designer` в `src/CSEngine/Programs/Desktop`. Подробности - в [гайде 16](guides/16-desktop.md).

## Проверки и тесты

Команды выполняются в `src/CSEngine/Core` (у остальных модулей набор похожий, см. их `package.json`):

```bash
pnpm typecheck    # vue-tsc (исходники + .vue) и tsc для конфигов, сборочных скриптов и тестов
pnpm lint         # ESLint (typescript-eslint); pnpm lint:fix - с автоисправлением
pnpm test         # Vitest с покрытием; падает, если любой файл ниже 100% по любой метрике
pnpm test:e2e     # Playwright: собирает сайт и играет в него в Chromium, как пользователь
pnpm verify       # всё вышеперечисленное + сборка
```

Для `pnpm test:e2e` нужен браузер: один раз выполните `pnpm exec playwright install chromium`. Подробности о тестах - в [гайде 01](guides/01-getting-started.md).
