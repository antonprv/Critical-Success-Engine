# Third-party code and assets

What the engine ships that others made, under which licence, and what was changed.

| What | Where | Version | Licence | Changes |
|---|---|---|---|---|
| [Quasar](https://github.com/quasarframework/quasar) (UI framework, used as a dependency) | `node_modules/quasar` via `Modules/Engine/UI`, `Core` | 2.34.0 | MIT, © 2015-present Razvan Stoenescu | none: used as published; the engine imports its sources file by file and reads its API descriptions (`dist/api`) to build its catalog |
| [Material Icons](https://github.com/google/material-design-icons) (icon font, from `@quasar/extras` 2.1.0) | `src/CSEngine/Modules/Engine/UI/Source/Quasar/Fonts/MaterialIcons` | `@quasar/extras` 2.1.0 | Apache-2.0 (text in `LICENSE` beside the font), © Google | the font file renamed; its CSS reduced to the font face and the `.material-icons` class |
| [Roboto](https://github.com/googlefonts/roboto) (font of the Quasar kit, from `@quasar/extras` 2.1.0) | `src/CSEngine/Modules/Engine/UI/Source/Quasar/Fonts/Roboto` | `@quasar/extras` 2.1.0 | Apache-2.0 (text in `LICENSE` beside the font), © Google | font files as published; paths in its CSS changed |
