[English](../../en/guides/24-sdf.md) | **Русский**

# 24. SDF-мир

Модуль `Modules/Engine/SDF` (`@cse/sdf`) — мир из signed distance fields поверх Babylon, по `plan.md`: упорядоченный
список правок как единственный источник истины, точное поле на CPU, кэш расстояний в кирпичах, меш-тир для слабых
устройств и ray-marched слой, который делит глубину с обычными мешами Babylon.

```bash
cd src/CSEngine/Modules/Engine/SDF
pnpm dev          # демо: http://127.0.0.1:5177/
pnpm test         # юнит-тесты (100% покрытия на файл)
pnpm test:e2e     # проверка глубины в Chromium (после pnpm build)
pnpm bench        # замеры CPU-части
```

## Список правок

Мир — это список правок (`EditList`). Правка — форма (сфера, бокс, скруглённый бокс, капсула, тор, цилиндр, эллипсоид),
поза и равномерный масштаб, булева операция с тем, что было до неё (объединение, вычитание, пересечение и их гладкие
версии с радиусом `SmoothK`), материал, флаги и режим физики. Порядок важен: операции не коммутативны.

```ts
import { EditList, GroundPlane, SdfField, SdfOp, SdfShape } from "@cse/sdf";

const edits = new EditList();
const field = new SdfField( edits, new GroundPlane( 0 ) );   // L0: земля

edits.Add( { Shape: SdfShape.Sphere, Position: [ 0, 1.6, 0 ], Params: [ 2, 0, 0, 0 ], MaterialId: 1 } );

// дыра, которую можно двигать: обычная правка, а не необратимая мутация
const hole = edits.Add( {
	Shape: SdfShape.Sphere,
	Op: SdfOp.SmoothSubtract,
	Params: [ 0.9, 0, 0, 0 ],
	SmoothK: 0.3,
} );

edits.Update( hole.Id, { Position: [ 1, 0.2, 3 ] } );
```

Каждая правка упаковывается в 64 байта (`PackEdit`), в том же виде, в каком её возьмёт GPU-буфер. Что ещё даёт список:

| | |
|---|---|
| `Version` | растёт с каждым изменением; воркер сообщает, до какой версии догнал |
| `Watch()` | свой поток «изменённых коробок» для каждого потребителя (кирпичи, чанки, физика) |
| `TakeDelta()` / `ApplyDelta()` | изменения одним transferable-буфером для другого воркера; на той стороне те же id |
| `Serialize()` / `EditList.Deserialize()` | сохранение (версионированный бинарный формат; правки-превью не сохраняются) |
| `Candidates( box )` | правки, которые могут что-то изменить в области, по порядку (BVH; пересечения — всегда) |

## Поле

`SdfField` считает расстояние, материал, нормаль (4 выборки по тетраэдру) и рейкаст (sphere tracing только по правкам на
пути луча). Это эталон для геймплея и физики. Для выборки многих точек одной области есть `field.Compile( edits )` —
`SdfProgram`: правки упакованы в один массив, формы и операции встроены в цикл; результат совпадает с `Evaluate`.

```ts
const hit = field.Raycast( [ 0, 5, 10 ], [ 0, -0.3, -1 ], 100 );   // T, Position, Normal, MaterialId или null
const program = field.Compile( edits.Candidates( regionBox ) );
const d = program.Distance( x, y, z );
```

Базовый слой L0 — `GroundPlane` или `NoiseTerrain` (холмы из октав value noise с поправкой Липшица, чтобы луч не
проскакивал склон).

## Кирпичи

`SdfVolume` — один уровень кэша (разделы 5–6 plan.md): окно карты кирпичей M³ вокруг глаза с тороидальной адресацией,
атлас R8 из слотов 10³ (кирпич 8³ ячеек плюс запас под трилинейную фильтрацию), copy-on-write при замене кирпича.
`Update()` берёт изменённые коробки, расширяет их на кодируемый диапазон, помечает ячейки устаревшими и перестраивает
не больше `Budget` ячеек за вызов, ближние к глазу первыми; устаревший кирпич остаётся видимым, пока не готов новый.
`Sample( x, y, z )` читает кэш так же, как GPU (трилинейно).

## Меш-тир

`SdfMeshChunks` строит мир треугольниками вокруг центра (игрока): Surface Nets по чанкам с общими границами (без щелей
и двойных граней), нормали по градиенту, запечённый AO, 16-битные индексы. Правка перестраивает только чанки, до
которых дотягивается; чанк, далёкий от поверхности, пропускается одной пробой в центре. Это основной вид мира на
слабых телефонах (раздел 23) и те же чанки, что нужны физике (раздел 9.2).

## В сцене Babylon

```ts
import { DenseSdfGrid, SdfMeshChunks } from "@cse/sdf";
import { SdfMeshLayer, SdfRaymarchLayer } from "@cse/sdf/render";

// тир B: ray marching плотной сетки, глубина пишется в общий буфер
const layer = new SdfRaymarchLayer( scene, new DenseSdfGrid( field, bounds, 160 ) );

// тир C: меши
const meshes = new SdfMeshLayer( scene, new SdfMeshChunks( field, { CellSize: 0.2, ChunkCells: 20 } ) );
scene.onBeforeRenderObservable.add( () => meshes.Update() );
```

`SdfRaymarchLayer` рисует задние грани коробки вокруг сетки; фрагментный шейдер идёт по 3D-текстуре, освещает
попадание в том же проходе (солнце и небо берутся из `DirectionalLight` и `HemisphericLight` сцены, плюс AO и мягкие
тени по полю) и пишет `gl_FragDepth`, поэтому меши перед SDF-поверхностью и за ней сортируются обычным тестом глубины.
`DebugView`: нормали, число шагов на пиксель, полосы расстояния. Нужен WebGL2.

`ChooseTier( DetectCapabilities( gl, "gpu" in navigator ) )` выбирает тир по возможностям устройства, результату
короткого бенчмарка и выбору игрока.

## Запечённая база и последние правки

Редактор хранит все правки, а при сборке запекает их в одно сэмплированное поле — `SdfBakedLayer`: ячейки по 8³
выборок, у ячеек рядом с поверхностью — кирпич 9³ (расстояние и материал по байту), у остальных — только расстояние в
центре (граница снизу, луч по-прежнему шагает крупно). Игра держит `SdfWorld`: эту базу и не больше `MaxEdits`
последних правок. Когда правок больше, самые старые вплавляются в базу (`Fold`: пересэмплируются только ячейки, до
которых правка дотягивается); правки с флагом `Keep` (движущаяся дыра) не вплавляются никогда.

```ts
import { SdfBakedLayer, SdfEditFlags, SdfOp, SdfShape, SdfWorld } from "@cse/sdf";

// сборка в редакторе: весь список правок -> одна база (её же можно сохранить: Serialize)
const base = SdfBakedLayer.Bake( editorField, { Bounds: bounds, Spacing: 0.1 } );

// в игре
const world = new SdfWorld( base, { MaxEdits: 16 } );
const hole = world.Add( { Shape: SdfShape.Sphere, Op: SdfOp.Subtract, Flags: SdfEditFlags.Keep } );
world.Add( { Shape: SdfShape.Sphere, Op: SdfOp.Subtract, Position: hit.Position } );   // копание
```

Вплавления едут в дельтах списка правок, поэтому реплика мира в воркере (`SdfWorld.FromBase` + `ApplyDelta`) вплавляет
те же правки в том же порядке и совпадает с основным миром бит в бит. Для этого все числа правки при входе в список
округляются до float32 — так их видит и упакованная форма, и GPU.

## Меш-тир в воркерах

`SdfMeshWorkers` — тот же меш-тир, но каждый чанк строит один из пула воркеров (по умолчанию ядра минус одно), у
каждого — реплика мира. Пул сам забирает дельты мира и рассылает их, чанки, которых ещё нет, строятся раньше
перестроек, а чанк, который ещё считается, не отправляется повторно. Слою Babylon всё равно, откуда чанки:

```ts
import { CreateMeshWorker, SdfMeshWorkers } from "@cse/sdf";

const chunks = new SdfMeshWorkers( world, { CellSize: 0.2, ChunkCells: 20, Radius: 2 }, CreateMeshWorker );
const meshes = new SdfMeshLayer( scene, chunks );
```

## Физика

Чанк меш-тира — обычная статика CSPhysics. Физический воркер принимает команды `PhysOpType.SdfChunk` (ключ, позиции
и индексы чанка) и `RemoveSdfChunk`: новый чанк становится статикой, перестроенный меняет форму на месте
(`SetStaticShape`, тела на нём просыпаются), старый меш освобождается.

## SDF в движке

Сцена объявляет SDF-мир полем `sdf` манифеста: запечённую базу (файл сборки редактора по URL или правки, которые
запекаются при загрузке), лимит последних правок и параметры меш-тира. Мир живёт в отдельном SDF-воркере: GameLogic
держит только последние правки и раз в кадр отправляет их дельтой вместе с точкой, вокруг которой строятся чанки
(камера или точка `FocusAhead` перед ней); чанки уходят из SDF-воркера прямо в рендер и в физику.

```ts
export const Level: SceneManifest = {
	id: "level", name: "Level", description: "…",
	sdf: {
		Base: { Url: "levels/level.sdf" },     // или { Bake: { Edits, Ground, Bounds, Spacing } }
		MaxEdits: 16,
		CellSize: 0.25, ChunkCells: 16, Radius: 3,
		FocusAhead: 20,
		Start: [ 0, 0, 0 ],                    // строится первым, до создания сущностей
	},
	entities: [ … ],
};
```

Сцена не создаёт свои сущности, пока SDF-воркер не построит область вокруг `Start` (и для рендера, и для физики),
поэтому тела не проваливаются сквозь землю, которой ещё нет. Пока сцена грузится, воркер строит чанки вокруг
`Start`; ставь её туда, куда будет смотреть фокус камеры. Ожидание сдаётся через 30 с с предупреждением, а мир,
который не загрузился (`LoadError`), не ждут.

Из скрипта — `this.Engine.Sdf`:

```ts
const hole = this.Engine.Sdf.Add( { Shape: SdfShape.Sphere, Op: SdfOp.Subtract, Flags: SdfEditFlags.Keep } );
this.Engine.Sdf.Update( hole.Id, { Position: [ x, y, z ] } );   // id известен сразу
const hit = await this.Engine.Sdf.Raycast( origin, dir );        // ответ через кадр
```

## Что дальше

Пока нет тира B в движке (ray marching работает в демо модуля, но не в рендер-воркере), многоуровневых clipmap на GPU,
cone marching и тира A (WebGPU).
План и оценки — `docs/stage6-estimates.md`, вопросы — `docs/stage6-questions.md`, сделанное — `docs/stage6-progress.md`.
