# 01. Старт

## Что нужно

- **Node 22+** и **pnpm**.
- Для физики: **.NET 10 SDK** и workload `wasm-tools` (`dotnet workload install wasm-tools`).
  Без них всё остальное работает (рендер, меню, скрипты) - просто тела не двигаются, см. ниже.

## Запуск

```bash
cd src/CSEngine          # рабочее пространство pnpm: движок и его модули
pnpm install
cd Core
pnpm dev            # http://127.0.0.1:5173
```

Что увидишь, если **физику ещё не собирали**: экран загрузки, потом сцена и всплывающее сообщение
*«Physics failed to load - the scene runs without a simulation»*. Это нормально: воркер физики сообщает об ошибке сразу,
движок не ждёт его, а сцены, меню, скрипты и рендер работают. Шар в *Bouncing ball* просто висит в воздухе.

## Сборка физики (wasm)

Подробно - в `src/CSEngine/Physics/Bridge/BUILD.md`. Коротко:

```bash
cd devops
bash build-physics.sh        # Windows: build-physics.bat - то же самое делает CI
```

Результат: `src/CSEngine/Binaries/Physics/Release/net10.0/browser-wasm/AppBundle/_framework`. Именно оттуда `pnpm dev`
раздаёт файлы по адресу `/physics-wasm/_framework/…` - никуда копировать не надо, достаточно обновить страницу.
`pnpm build` копирует эту папку в `Binaries/Core/physics-wasm/_framework`, так что готовая сборка берёт физику по тому же
адресу. Другую папку можно указать через переменную окружения `PHYSICS_WASM_DIR`.

**Первая проверка «живой» физики:** открой сцену *Bouncing ball* (шар должен упасть и лежать на плите, пробел подбрасывает
его), потом *Character test room* (бегать, прыгать, встать на лифт - он должен тебя везти).

## Управление

Нажми **Play** (браузер отдаёт игре мышь только по клику). Дальше:

| Клавиша | Действие |
|---|---|
| `W A S D`, мышь | движение, обзор |
| `Space` | прыжок |
| `N` | ноклип (полёт сквозь стены) |
| `1`…`5` | режим движения: Quake, Realistic, Hybrid, Doom 3, Quake-Strafe-Doom2016 |
| `V` | камера: от первого / от третьего лица |
| `ЛКМ` | выстрел (в сцене *Character test room*) |
| `R` | рестарт (в *Coin Hunt* после победы/поражения) |
| `Esc` | браузер отпускает мышь - открывается меню со списком сцен |

## Карта проекта

```
src/CSEngine/
  Core/                         ← всё, что про TypeScript
    Source/
      App.ts                    точка входа главного потока: поднимает Vue-UI и Orchestrator
      Ui/                       Vue + Quasar (только ОТРИСОВКА интерфейса)
      Workers/                  пять воркеров и протоколы между ними
        GameLogicWorker.ts        тонкая оболочка над Engine/Runtime
        RenderWorker.ts           Babylon на OffscreenCanvas
        PhysicsWorker.ts          цикл фиксированного шага
        Physics/PhysicsWorld.ts   ЕДИНСТВЕННОЕ место, которое говорит с wasm-мостом
        UiWorker.ts, Ui/UiController.ts   состояние и логика меню/загрузки
        Protocol/                 типы сообщений между воркерами
      Engine/                   ядро движка - работает внутри GameLogic
        Core/                     Component, Entity, EntityWorld, манифесты, Shapes, CollisionLayer
        Components/               готовые компоненты: MeshRenderer, тела, Mover, Camera…
        Services/                 Physics / Render / Input / Ui / Audio для скриптов
        Scenes/                   SceneManager (загрузка/выгрузка), SceneRegistry
        Runtime/GameLogicRuntime  два «такта»: кадр (Update) и физика (OnPhysicsUpdate)
        Math/                     Vec3, Quat
      Game/                     ← ТВОЯ ИГРА
        GameScenes.ts             список сцен (то, что видно в меню)
        Scenes/                   манифесты сцен
        Scripts/                  твои компоненты
        GuideExamples/            код из этих гайдов
    Tests/                      Vitest: юнит- и интеграционные тесты (в т.ч. весь рантайм на поддельных портах)
    E2E/                        Playwright: тесты собранного сайта в настоящем браузере
    BuildTools/                 плагины Vite: физика (раздача/копирование), sidecar логов
    public/                     статика, копируется в сборку как есть (public/assets/x → /assets/x)
    index.html                  HTML-точка входа Vite
    vite.config.ts              сборка и dev-сервер
  Physics/
    Bridge/PhysicsBridge.cs     C#-мост: единственное, что написано на C#
    Vendor/                     BEPU и обвязка Integration
```

Принцип, на котором всё держится: **C# есть только для физики и моста к ней**. Всё остальное - TypeScript.

## Цикл разработки

1. Правишь файлы в `Source/Game/**`.
2. Обновляешь страницу (изменения воркеров применяются перезагрузкой; Vue-компоненты обновляются на лету).
3. `pnpm test` - Vitest. Прогоняет **настоящий** GameLogicRuntime с поддельными воркерами (скрипты и сцены проверяются
   без браузера), а ещё Vue-интерфейс, мосты, оболочки воркеров и сборочные плагины. Считается покрытие, и прогон падает,
   если хоть один файл опустился ниже 100% по строкам, ветвям или функциям: новый код приходит вместе с тестами.
4. `pnpm typecheck` (внутри `vue-tsc`, он понимает `.vue`; обычный `tsc` на них ругается) и `pnpm lint`.
5. `pnpm test:e2e` - Playwright: собирает сайт так же, как `pnpm build`, раздаёт его через `vite preview` и играет в него
   в Chromium, как пользователь (меню, клавиатура, мышь, смена сцен, пиксели на экране). Браузер ставится один раз:
   `pnpm exec playwright install chromium`. Физику эти тесты берут из подменного рантайма (`E2E/fixtures/mock-physics`),
   чтобы не зависеть от .NET; с `E2E_REAL_PHYSICS=1` добавляется прогон на настоящей wasm-физике (так делает CI).

Всё сразу: `pnpm verify` (типы, линт, тесты, сборка, E2E).

Логи воркеров идут в консоль браузера. Если запущен sidecar-логгер (`vite dev` стартует его сам), они ещё пишутся в файл.
Файла `Tools/LogServer.mjs` в присланном мне архиве не было; если его нет и у тебя, sidecar не стартует, а логи останутся только в консоли браузера (игре это не должно мешать).

Дальше → [02. Первая сцена](02-first-scene.md)
