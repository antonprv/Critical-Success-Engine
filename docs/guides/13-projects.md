# 13. Проекты, шаблоны, UI-документы игры

Как в Unreal Engine: игра - это **проект** где угодно на диске; движок и инструменты знают проекты через **реестр**
пользователя; новый проект создаётся из **шаблона**.

## Проект

```
Starfall/
  Starfall.cseproject           дескриптор (как .uproject)
  Source/StarfallModule.ts      главный игровой модуль
  Content/UI/Ui.manifest.json   список UI-документов
  Content/UI/MainMenu.ui.json   UI-документы (их делает UI Designer)
```

`Starfall.cseproject`:

```json
{
  "FileVersion": 1,
  "Name": "Starfall",
  "Template": "FirstPerson",
  "Genre": "FirstPerson",
  "Modules": [{ "Name": "Starfall", "Primary": true, "Dependencies": ["Engine"], "Entry": "Source/StarfallModule.ts" }],
  "Plugins": [{ "Name": "UI", "Enabled": true }],
  "Ui": { "Manifest": "Content/UI/Ui.manifest.json" }
}
```

Модули проекта - те же модули, что в гайде 12 (`Type`, `LoadingPhase`, `Dependencies`), плюс `Entry` - файл, который
экспортирует класс модуля по умолчанию. Разбор (`@cse/core/projects`) называет, что не так: неизвестный жанр, модуль
без `Entry`, два главных модуля, файл новее движка.

Жанры: `Blank`, `FirstPerson`, `ThirdPerson`, `TopDown`, `Collectathon` - у каждого свой шаблон.

## Какой проект собирает движок

Движок собирает один проект - тот, что назван в `CSE_PROJECT`: путь к `.cseproject`, папка проекта (в ней ровно один
дескриптор) или имя зарегистрированного проекта. Без `CSE_PROJECT` собирается **Games Sample**
(`Core/Samples/GamesSample.cseproject`) - собственный проект движка для разработки и тестов. Своего кода у него нет:
его модули - главные модули шаблонов, поэтому в одной сборке есть все их игры (на ней работают E2E).

```
cd src/CSEngine/Core
CSE_PROJECT=Starfall pnpm dev                          # по имени из реестра
CSE_PROJECT=D:/Games/Starfall pnpm build               # по папке
CSE_PROJECT=../../Templates/Blank pnpm build           # шаблон - тоже проект
```

Плагин `BuildTools/ProjectPlugin.ts` отдаёт проект движку как модуль `virtual:cse/project`: дескриптор, модули проекта
(каждый `Entry` грузится динамически, отдельным файлом сборки) и UI-документы (читаются по требованию,
`LoadUiDocument(path)`). Импорты движка в файлах проекта (`@cse/core/modules`, `@cse/core/Engine/...`, `vue`)
разрешаются так, будто написаны в самом движке, - поэтому проект может лежать где угодно на диске.

## Реестр проектов

`Projects.json` в настройках пользователя: Windows - `%APPDATA%\CriticalSuccessEngine`, macOS -
`~/Library/Application Support/CriticalSuccessEngine`, Linux - `~/.config/CriticalSuccessEngine` (или `$XDG_CONFIG_HOME`).
Переменная `CSE_PROJECTS_REGISTRY` указывает другой файл. Код - `Core/BuildTools/Projects.ts`:
`RegisterProject`, `FindProject` (по имени или файлу), `ListProjects` (с пометкой, если файл исчез), `UnregisterProject`.
Повреждённый реестр - ошибка, а не тихая перезапись.

## Шаблоны

`src/Templates/<Имя>/` - папка проекта, где вместо имени стоит `TemplateProject` (в именах файлов и в тексте), плюс
`Template.json` (название, описание, жанр, порядок в списке). `CreateProject` копирует шаблон под именем проекта
(двоичные файлы - как есть), записывает в дескриптор шаблон и жанр и регистрирует проект. Имя проекта - идентификатор,
не совпадающий с модулями движка (`Engine`, `Core`, `UI`...).

| Шаблон | Жанр | Игра |
|---|---|---|
| Blank | Blank | мяч на полу; главное меню UI-документом |
| First Person | FirstPerson | персонаж от первого лица в тестовой комнате: бег, прыжки, склоны, лестницы, платформы, стрельба |
| Coin Hunt | Collectathon | собрать монеты до конца времени, вращающиеся препятствия, рестарт |
| Third Person | ThirdPerson | персонаж со спины на арене: «штанга» камеры укорачивается у стен, HUD с пройденным расстоянием |
| Top-Down | TopDown | вид сверху как в Baldur's Gate 3: средняя кнопка двигает вид, колесо приближает, курсор свободен; обойти площадки в углах |

Каждый шаблон - самостоятельный проект: движок собирает любой из них (`CSE_PROJECT=../../Templates/CoinHunt`), CI
собирает все. Код шаблонов покрыт тестами движка на 100% - это его образцовый контент. Вид сверху - компонент движка `StrategyCamera` в сцене со свободным курсором (`cursor: "free"` в описании сцены:
мышь не захватывается, Esc открывает меню, Resume возвращает в игру). Камера смотрит на точку на земле, которая
следует за персонажем; средняя кнопка двигает эту точку, колесо приближает (вблизи камера положе, вдали круче:
`ZoomMin`/`ZoomMax`, `PitchNear`/`PitchFar`), Home или ходьба возвращают к персонажу. Прокрутка от края экрана
(`EdgeScroll`) уже есть в камере; флажок для неё в меню паузы - следующим шагом.

## UI-документы в игре

`Ui.manifest.json` перечисляет документы проекта:

```json
{ "FileVersion": 1, "Documents": [{ "Id": "PauseMenu", "Path": "PauseMenu.ui.json", "Script": "" }] }
```

`Script` (необязательно) заменяет скрипт, который назван в самом документе. UI Designer дописывает сюда документы
(`UpsertManifestEntry`).

Скрипты игры показывают документы по `Id` через `UiManager` (`@cse/ui`):

```ts
const ui = new UiManager({ Manifest, Load: (path) => ReadText(path), Scripts });
await ui.Show("Hud");                              // загружается при первом показе, потом из кеша
ui.Hide("PauseMenu");
await ui.Toggle("Inventory");
const result = await ui.ShowDialog("ConfirmQuit"); // модально; DialogResult
```

`<WinUiHost :manager="ui" />` рисует показанные документы слоями поверх игры (новые сверху) и диалоги над ними;
клики проходят сквозь пустые места к игре. Документ, который закрылся сам (кнопка с `DialogResult`, крестик), исчезает
с экрана. Ошибки называют документ и файл.

## UI-документы из скриптов игры: плагин UI

Скрипты игры работают в воркере игровой логики, а документы рисуются на странице. Их связывает плагин движка **UI**
(`Modules/Engine/UI/UI.cseplugin`), который проект включает в своём дескрипторе (`"Plugins": [{ "Name": "UI",
"Enabled": true }]`). У плагина два модуля: `UIHost` на странице (слой документов поверх игры, под меню движка) и
`UIGame` в воркере - API для скриптов:

```ts
import { GetGameUi } from "@cse/ui/game";

const ui = GetGameUi();
ui.Show("CoinHuntHud");                                   // по Id из манифеста проекта
ui.SetText("CoinHuntHud", "Coins", "Coins: 3 / 9");       // надпись, кнопка, поле, заголовок окна
ui.SetVisible("CoinHuntHud", "Bonus", true);
ui.SetEnabled("PauseMenu", "SaveButton", false);
ui.SetValue("Loading", "Progress", 40);                   // прогресс-бар (0..100), ползунок, счётчик
ui.SetItems("Inventory", "Items", ["Key", "Map"]);        // список
const off = ui.On("PauseMenu", "ResumeButton", "click", () => Resume());
ui.Events.On("error", (message) => console.warn(message)); // неизвестный документ или виджет
ui.Hide("CoinHuntHud");
```

Экран загрузки - любой документ с прогресс-баром, где угодно в игре:

```ts
import { GetGameUi, LoadingScreen } from "@cse/ui/game";

const loading = new LoadingScreen(GetGameUi(), "LevelLoading"); // виджеты Progress и Status (или свои: { Bar, Label })
loading.Show("Loading the level");
loading.SetProgress(0.4);                                        // доля 0..1: 40% на полосе
loading.SetLabel("Spawning enemies");
loading.Hide();
```

`LoadingScreen` держит долю в пределах 0..1 и шлёт значение только когда меняется процент, подпись - только когда
меняется текст.

## Экраны движка: меню паузы и загрузка

Меню паузы и экран загрузки движка тоже UI-документы плагина UI: `EnginePauseMenu` (название игры, «Ready» или
«Paused», Play/Resume, список сцен с отметкой текущей; крестик окна возвращает в игру) и `EngineLoading` (полоса
прогресса и подпись). Оба закрывают игру под собой (Click pass-through выключен). Ими управляет сам движок: что
показать, следует за его состоянием; щелчки игрока вызывают его действия прямо из щелчка (захват мыши требует жеста).

Проект меняет их на свои, объявив в своём манифесте документы с теми же Id:

```json
{ "Id": "EngineLoading", "Path": "MyLoading.ui.json" }
```

Свой экран загрузки должен иметь полосу `Progress` и надпись `Status`; своё меню - окно `MenuWindow`, надписи
`Heading` и `Hint`, кнопку `PlayButton` и список `Scenes`. Без плагина UI движок рисует прежние экраны страницы.

Команды выполняются по порядку (`Show` и сразу `SetText` работают, хотя документ загружается асинхронно);
подписки `On` действуют и для документов, показанных позже. Надписи - живые виджеты: их текст и видимость меняются из
скриптов и из нод.

Пример - HUD шаблона Coin Hunt: документ `Content/UI/CoinHuntHud.ui.json` (окно в правом верхнем углу, с якорем
справа), `GameRules` показывает его при старте игры, меняет надписи только когда меняется текст и прячет его, когда
сцена уходит.

Второй пример - HUD шаблона First Person («sample FPS»): документ `Content/UI/FirstPersonHud.ui.json` с прицелом (надпись
«+», якоря по центру - она остаётся в середине экрана при любом размере) и панелью со счётчиком выстрелов в правом
нижнем углу (якоря справа и снизу). Компонент шаблона `FpsHud` показывает документ и обновляет счётчик по
`Shooter.ShotsFired`. У прицела в документе включён флажок Click pass-through (гайд 11): щелчки проходят сквозь него, он не мешает стрелять.
