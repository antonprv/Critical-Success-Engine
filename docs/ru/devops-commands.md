[English](../en/devops-commands.md) | **Русский**

# Скрипты devops

В папке `devops/` лежат скрипты для сборки и запуска. У каждого есть версия для PowerShell (`.ps1`, `pwsh`) и для Bash (`.sh`).
Запускайте их из корня репозитория.

## Быстрый старт: Project Manager (Electron)

```bash
# Bash
bash devops/build-all.sh --skip-physics
bash devops/start-desktop.sh
```

```powershell
# PowerShell
pwsh devops/build-all.ps1 -SkipPhysics
pwsh devops/start-desktop.ps1
```

Первая команда ставит зависимости и собирает утилиту проектов, UI Designer и программу на Electron; вторая запускает программу.
Бинарник Electron скачивается при первом запуске.

Для самой утилиты хватает `--skip-physics`. Но кнопки **Run** и **Build** для проектов используют сборку физики движка, поэтому чтобы проекты запускались с физикой,
уберите флаг (нужен .NET SDK) или отдельно выполните `build-physics`. Что делают эти кнопки - в [гайде 16](guides/16-desktop.md).

## build-all - полная сборка

Собирает по шагам: зависимости, физику (wasm), Project Browser, UI Designer, Desktop (Electron). Перед началом проверяет Node.js 22.12+ и pnpm.
Если не найден `dotnet` или не собралась физика - печатает предупреждение и продолжает без неё (игра тогда работает без симуляции).
Лог публикации физики - `devops/publish.log`.

| Bash | PowerShell | Что делает |
|---|---|---|
| `--skip-install` | `-SkipInstall` | не запускать `pnpm install` |
| `--skip-physics` | `-SkipPhysics` | не публиковать wasm физики (быстрее; для Project Manager физика не нужна) |
| `--web` | `-Web` | дополнительно собрать веб-игру (Core) в `src/CSEngine/Binaries/Core` |

```bash
bash devops/build-all.sh                  # полная сборка
bash devops/build-all.sh --skip-physics   # без физики, быстрее
bash devops/build-all.sh --skip-install --web
```

```powershell
pwsh devops/build-all.ps1                 # полная сборка
pwsh devops/build-all.ps1 -SkipPhysics    # без физики, быстрее
pwsh devops/build-all.ps1 -SkipInstall -Web
```

## start-desktop - запуск Project Manager

Запускает десктопную программу (Electron). Если что-то не собрано, говорит, чего не хватает, и подсказывает команду сборки.

| Bash | PowerShell | Что делает |
|---|---|---|
| `--build` | `-Build` | сначала собрать (`build-all` без физики) |
| `--designer` | `-Designer` | открыть UI Designer отдельно (он спросит, с каким проектом работать) |

Переменные окружения `CSE_PROJECT_BROWSER_URL` и `CSE_UI_DESIGNER_URL` подменяют собранные страницы адресами dev-серверов Vite
(и тогда скрипт не проверяет, что эти страницы собраны). Подробнее - в [гайде 16](guides/16-desktop.md).

## build-physics - только физика

```bash
cd devops && bash build-physics.sh      # Windows: build-physics.bat
```

Публикует `Physics/Bridge` в wasm (`dotnet publish`, Release) и пишет лог в `publish.log`. Запускать нужно из папки `devops`:
пути в скрипте относительные. То же делает CI. Подробности - в [ручной сборке](manual-build.md).

## Служебные скрипты

| Скрипт | Что делает |
|---|---|
| `log-specs.sh` / `log-specs.ps1` | печатает характеристики машины: процессор, память, видеокарту, накопители (удобно приложить к отчёту о производительности) |
| `write-tree.sh` | записывает список файлов, отслеживаемых git, в `git-filetree.txt` в корне репозитория (запускать из `devops`) |
| `write-tree.ps1` | рисует дерево каталогов в `file-tree.txt`, пропуская `.git`, `.vs`, `node_modules`, `bin`, `obj`, `dist`; параметры `-RootPath` и `-OutputPath` |
