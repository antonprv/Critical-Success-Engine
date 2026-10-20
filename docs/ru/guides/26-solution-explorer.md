[English](../../en/guides/26-solution-explorer.md) | **Русский**

# 26. Solution Explorer

Инструменты (UIDesigner, редактор таблиц, менеджер проектов) показывают файлы проекта деревом, устроенным как
Solution Explorer в Visual Studio, в двух режимах:

- **Реальные файлы** (`ViewMode.Files`, аналог Folder View): папка проекта как она есть на диске. Новая папка,
  переименование, перемещение, копирование и удаление происходят на диске.
- **Виртуальные папки** (`ViewMode.Solution`, режим решения): решение, его визуальные проекты и подпроекты,
  виртуальные папки. Новая папка — виртуальная, перемещение меняет только то, где элемент показан, элементы можно
  скрывать. Переименование и удаление файла по-прежнему выполняются на диске.

В новом проекте оба режима показывают одно и то же (режим решения, как и Visual Studio, скрывает файлы проекта).
Расхождение появляется, только когда создаются виртуальные папки, элементы перемещаются или скрываются. Что входит в
паритет с Visual Studio — в [docs/solution-explorer-parity.md](../../solution-explorer-parity.md).

## Из чего состоит

| Часть | Где | Что делает |
|---|---|---|
| `SolutionModel` | `@cse/solution` (`Modules/Editor/Solution`) | дерево каждого режима, операции, undo/redo, `.uisolution` |
| `ProjectFileSystem` | `@cse/solution` | файлы проекта: `NodeFileSystem` (диск, главный процесс), `BridgeFileSystem` (страница настольного приложения), `MemoryFileSystem` (тесты) |
| `SolutionService` | `Programs/Desktop` | диск для страниц по IPC (`window.cse.solution`); удаление — в корзину |
| `WinSolutionTree`, `SolutionTreeController` | `@cse/ui` | дерево на экране: множественное выделение, F2, Del, Ctrl+C/X/V/Z/Y, перетаскивание, поиск, большие деревья |
| виджет `solutiontree` | `@cse/ui` | то же дерево в палитре UIDesigner, для UI-документов инструментов |

## Файл `.uisolution`

Лежит рядом с `.cseproject` и хранит только представление: визуальные проекты (подпроект можно привязать к реальной
папке), виртуальные папки, куда элементы перемещены в режиме решения, скрытые файлы, раскрытые узлы и режим. Какие
файлы есть, решает диск (и манифесты инструментов: файл из манифеста, которого нет на диске, показывается как
пропавший). Это JSON с отступами и постоянным порядком ключей, поэтому он хорошо читается в diff.

## Как подключить к инструменту

```ts
import { BridgeFileSystem, SolutionModel } from "@cse/solution";
import { SolutionTreeController, UseControl } from "@cse/ui";

const files = new BridgeFileSystem(window.cse!.solution!, projectFile);
const model = await SolutionModel.Open({ Files: files, SolutionPath: "Game.uisolution", ProjectName: "Game", FolderName: "Game" });
const tree = UseControl(new SolutionTreeController({ Nodes: [model.Tree], Expanded: model.Data.Expanded[model.Mode] }));
model.OnChanged(() => tree.SetNodes([model.Tree]));
tree.Events.On("rename", (id, name) => void model.Rename(id, name));
tree.Events.On("move", (ids, target) => void model.Move(ids, target));
tree.Events.On("expand-change", (id, open) => void model.SetExpanded(id, open));
tree.Events.On("delete", (ids) => { if (confirm("Удалить?")) void model.Delete(ids); });
```

Опция `Describe` у `SolutionModel.Open` сообщает модели, какие файлы перечисляют манифесты инструмента и какой файл
вкладывается под какой, например сгенерированный скрипт под свой UI-документ.
