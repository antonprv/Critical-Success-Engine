**English** | [Русский](../../ru/guides/26-solution-explorer.md)

# 26. Solution Explorer

The tools (the UI Designer, the table editor, the Project Manager) show a project's files as a tree organised like
Visual Studio's Solution Explorer, in two modes:

- **Folder View** (`ViewMode.Files`): the project's folder as it is on disk. A new folder, a rename, a move, a copy,
  a delete happen on disk.
- **Solution view** (`ViewMode.Solution`): the solution, its visual projects and sub-projects, virtual folders. A new
  folder is a virtual one, moving an item only changes where it is shown, items can be hidden. Renaming or deleting a
  file is still done on disk.

With a fresh project both modes show the same thing (the solution view hides the project files, as Visual Studio does).
They differ only once you make virtual folders, move items or hide them. What the parity with Visual Studio covers is
listed in [docs/solution-explorer-parity.md](../../solution-explorer-parity.md).

## The parts

| Part | Where | What it does |
|---|---|---|
| `SolutionModel` | `@cse/solution` (`Modules/Editor/Solution`) | the tree of each mode, the operations, undo/redo, the `.uisolution` |
| `ProjectFileSystem` | `@cse/solution` | the project's files: `NodeFileSystem` (the disk, main process), `BridgeFileSystem` (a page of the desktop app), `MemoryFileSystem` (tests) |
| `SolutionService` | `Programs/Desktop` | the disk for the pages, over IPC (`window.cse.solution`); deletes go to the recycle bin |
| `WinSolutionTree`, `SolutionTreeController` | `@cse/ui` | the tree on screen: multiple selection, F2, Del, Ctrl+C/X/V/Z/Y, drag and drop, search, big trees |
| widget `solutiontree` | `@cse/ui` | the same tree in the UI Designer's palette, for UI documents of the tools |

## The `.uisolution`

It lies next to the `.cseproject` and holds only how things are shown: visual projects (a sub-project can be bound to a
real folder), virtual folders, where items were moved in the solution view, hidden files, the expanded nodes and the
mode. Which files there are is the disk's business (and the manifests' of the tools: a file a manifest lists that is
missing on disk is shown as missing). It is indented JSON with keys in a fixed order, so it diffs well.

## Using it in a tool

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
tree.Events.On("delete", (ids) => { if (confirm("Delete?")) void model.Delete(ids); });
```

`Describe` (an option of `SolutionModel.Open`) tells the model which files the tool's manifests list and which file
nests under which, for example a generated script under its UI document.
