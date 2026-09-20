# LanternFestival

Проект на [Babylon.js](https://www.babylonjs.com/) (TypeScript + Webpack).

## Требования

- [Node.js](https://nodejs.org/) 18+
- [pnpm](https://pnpm.io/) — единственный поддерживаемый пакетный менеджер проекта

Установка pnpm, если он ещё не установлен:

```bash
npm install -g pnpm
```

## Установка

После клонирования репозитория:

```bash
pnpm install
```

## Запуск в режиме разработки

Поднимает dev-сервер с hot reload на `http://localhost:8080`:

```bash
pnpm start
```

## Сборка

Продакшен-сборка бандла в `dist/` (минификация, разбиение на чанки, хэши в именах файлов):

```bash
pnpm build
```

Сборка в режиме разработки (без минификации, быстрее):

```bash
pnpm build:dev
```

Полная пересборка (очистка `dist/` + продакшен-сборка):

```bash
pnpm rebuild
```

## Проверка типов и линт

Прогон TypeScript-компилятора без генерации файлов:

```bash
pnpm typecheck
```

Линт исходников (`@typescript-eslint`):

```bash
pnpm lint
pnpm lint:fix   # с автоисправлением
```

## Ассеты

- `src/assets/` — файлы, которые импортируются прямо из TS-кода (`import tex from "./assets/rock.png"`); Webpack хэширует их и кладёт в `dist/assets`.
- `public/assets/` — статические файлы, которые нужно скопировать в `dist/assets` как есть, без импорта из кода (например, крупные level-данные).

## CI/CD

`.github/workflows/ci.yml` на каждый push/PR в `main` устанавливает зависимости (`pnpm install --frozen-lockfile`), прогоняет `typecheck` → `lint` → `build` и сохраняет `dist/` как артефакт сборки.

## Структура проекта

```
src/                — исходный код (точка входа: src/app.ts)
src/assets/         — ассеты, импортируемые из кода
public/             — статические файлы и HTML-шаблон (index.html)
public/assets/      — статические ассеты, копируемые в dist как есть
dist/               — результат сборки (не хранится в git)
.github/workflows/  — CI-пайплайн
webpack.config.js   — конфигурация Webpack (dev/prod режимы) и dev-сервера
tsconfig.json       — конфигурация TypeScript
eslint.config.js    — конфигурация ESLint (typescript-eslint)
LanternFestival.esproj / .slnx — файлы проекта для Visual Studio / Rider
```

## Открытие в IDE

Проект можно открыть как обычную папку в VS Code, либо через `LanternFestival.slnx` в Visual Studio или JetBrains Rider (JS/TS-проект).