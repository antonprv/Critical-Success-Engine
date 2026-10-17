# Этап 6: сверка — SDF-часть

Таблица «подэтап, критерий, коммиты, доказательство» для того, что сделано по SDF. Подэтапы — из
`docs/stage6-estimates.md`. Тесты запускаются в `src/CSEngine/Modules/Engine/SDF`: `pnpm test` (vitest, 100% покрытия на
файл), `pnpm test:e2e` (Playwright, после `pnpm build`), `pnpm bench`.

| Подэтап | Критерий | Коммиты | Доказательство |
|---|---|---|---|
| SDF.1 | Правка — 64 байта, упаковка без потерь (`plan.md` 4.1) | 85ec176 | `Tests/Edits.test.ts` «round-trip through 64 bytes» |
| SDF.1 | Список правок — источник истины: версии, дельты между воркерами, сохранение без превью (6.6, 9.6) | 85ec176 | `Tests/Edits.test.ts` «replays its changes…», «saves and loads…» |
| SDF.1 | Отсечение правок по области через BVH, пересечения всегда в выборке (2.5b) | 85ec176 | `Tests/Edits.test.ts` «finds the edits that reach a box…», `Tests/Spatial.test.ts` (сверка с перебором) |
| SDF.1 | Точное поле, материалы, нормали, рейкаст (6.5, 5.7) | 85ec176, 9ecdfc7 | `Tests/Field.test.ts` |
| SDF.2 | Кэш кирпичей совпадает с полем у поверхности с точностью квантования (5.1–5.2) | 85ec176 | `Tests/Bricks.test.ts` «caches the field in bricks…» (200 точек, ошибка < 0,01) |
| SDF.2 | Инкрементальная перестройка по бюджету, устаревший кирпич виден до замены, copy-on-write (5.5, 6.1, 6.4) | 85ec176 | `Tests/Bricks.test.ts` «rebuilds what an edit touches…» |
| SDF.2 | Окно следует за глазом с гистерезисом, тороидальная адресация (5.4) | 85ec176 | `Tests/Bricks.test.ts` «follows the eye with hysteresis», «moves its window…» |
| SDF.3 | **M0: кубы и SDF-сфера корректно перекрывают друг друга** (15) | 9ecdfc7, 5500eaf | `E2E/Depth.spec.ts` (Chromium, тир B и тир C); мутационная проверка: без записи глубины тест падает |
| SDF.3 | Отладочные визуализации (7.7) | 9ecdfc7 | демо `?view=1..3` (нормали, шаги, полосы расстояния) |
| SDF.4 | Чанки без щелей и двойных граней (9.2, 22.3) | 85ec176 | `Tests/Mesh.test.ts` «joins chunks without cracks or doubles» (каждое ребро — ровно два встречных) |
| SDF.4 | 16-битные индексы, AO в вершинах, нормали по градиенту (23.3, 24.2) | 85ec176 | `Tests/Mesh.test.ts` |
| SDF.4 | Перестраиваются только чанки, до которых дотянулась правка, по бюджету (22.3) | 85ec176, 5500eaf | `Tests/Mesh.test.ts` «remeshes what an edit reaches…» |
| SDF.4 | Меш-тир в сцене Babylon, правильный обход граней в лево- и правосторонней системе | 9ecdfc7 | демо `?tier=mesh`, `?lh=1`; `E2E/Depth.spec.ts` (тир C) |
| — | Выбор тира по возможностям, бенчмарку и выбору игрока (22.5, 23.7) | 85ec176 | `Tests/Tier.test.ts` |
| S6-05 (SDF) | Замеры CPU-части | 1a95a30 | `pnpm bench`; числа — в `docs/stage6-estimates.md` («Риски») |
| — | CI: проверки модуля | 5500eaf | `.github/workflows/ci.yml`, шаг «SDF module» |
| SDF.4b | Запечённая база совпадает с полем у поверхности и не завышает расстояние вдали (10.2) | 2d94de5 | `Tests/Bake.test.ts` |
| SDF.4b | Игра держит не больше `MaxEdits` правок, старые вплавляются, `Keep` не вплавляется | 2d94de5 | `Tests/Bake.test.ts` «keeps only the last edits…» |
| SDF.4b | Реплика в воркере совпадает с основным миром бит в бит (вплавления в дельтах, float32 на входе) | 2d94de5 | `Tests/Bake.test.ts` «stays identical in a worker…» (500 точек) |
| SDF.4c | Меши из воркеров равны мешам главного потока, также после правок, вплавлений и нового пула | 3b530e3 | `Tests/Workers.test.ts` |
| SDF.4c | Движущаяся правка не морит голодом остальную область | 3b530e3 | `Tests/Mesh.test.ts` «hands out chunks never meshed…», демо `?tier=mesh` |
| SDF.8a | Чанк — твёрдая статика; перестроенный чанк меняется на месте и будит лежащие на нём тела; память не растёт | 3d39d77 | `Modules/Physics/Tests/SdfChunks.cs` (29/29, SIMD и CseNoSimd) |
| SDF.8a | Команды `SdfChunk`/`RemoveSdfChunk` физического воркера | 3d39d77 | `Core/Tests/PhysicsWorldFull.test.ts` «SDF chunks» |

Сверка по заимствованиям: код написан заново по `plan.md`; папки `/Claude` в контейнере не было, ничего из неё не
использовалось. Формулы расстояний — общеизвестные замкнутые формы (каталог Иниго Килеса), записаны своими словами.
