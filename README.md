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

Сборка бандла в `dist/`:

```bash
pnpm build
```

Полная пересборка (очистка `dist/` + сборка):

```bash
pnpm rebuild
```

## Проверка типов

Прогон TypeScript-компилятора без генерации файлов:

```bash
pnpm typecheck
```

## Структура проекта

```
src/                — исходный код (точка входа: src/app.ts)
public/             — статические файлы и HTML-шаблон (index.html)
dist/               — результат сборки (не хранится в git)
webpack.config.js   — конфигурация Webpack и dev-сервера
tsconfig.json       — конфигурация TypeScript
eslint.config.js    — конфигурация ESLint
LanternFestival.esproj / .slnx — файлы проекта для Visual Studio / Rider
```

## Открытие в IDE

Проект можно открыть как обычную папку в VS Code, либо через `LanternFestival.slnx` в Visual Studio или JetBrains Rider (JS/TS-проект).