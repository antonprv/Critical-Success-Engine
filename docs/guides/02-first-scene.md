# 02. Первая сцена

Сцена — это **данные**. Ты описываешь, какие сущности есть и из каких компонентов они состоят; движок создаёт их,
вызывает хуки и убирает при выгрузке. Никакого «императивного» создания объектов в `main`.

Мы сделаем сцену **Ball pit**: коробка и двенадцать шаров, которые в неё падают.

## Система координат

- Правосторонняя, **Y вверх**, «вперёд» = **−Z** (как в Godot и в BEPU — поэтому позы из физики кладутся в рендер как есть).
- Единицы — **метры**. Углы — радианы. Цвета — `[r, g, b]` в диапазоне 0…1.
- Поворот — кватернион `[x, y, z, w]`; удобнее получать из `Quat.FromAxisAngle(ось, угол).ToTuple()`.

## Шаг 1. Файл сцены

Создай `Source/Game/Scenes/BallPitScene.ts` (готовая версия лежит в `Game/GuideExamples/BallPitScene.ts`):

```ts
import { CollisionLayer } from "../../Engine/Core/CollisionLayer";
import { Comp, Ent, type EntityManifest, type SceneManifest } from "../../Engine/Core/EntityManifest";
import { MeshForShape, Shapes } from "../../Engine/Core/Shapes";
import { FixedCamera } from "../../Engine/Components/Camera/CameraComponent";
import { MeshRenderer } from "../../Engine/Components/MeshRenderer";
import { RigidBody } from "../../Engine/Components/Physics/PhysicsBodies";
import { StaticBox } from "../SceneHelpers";
import { HudText } from "../Scripts/Scripts";
```

```ts
const BallShape = Shapes.Sphere(0.5);

function Ball(index: number): EntityManifest {
	// Colours are 0..1 rgb; this just walks round the colour wheel.
	const color: [number, number, number] = [
		(Math.sin(index * 1.7) + 1) / 2,
		(Math.sin(index * 1.7 + 2) + 1) / 2,
		(Math.sin(index * 1.7 + 4) + 1) / 2,
	];

	return Ent(`Ball ${index}`, [
		Comp(MeshRenderer, { Mesh: MeshForShape(BallShape), Color: color }),
		Comp(RigidBody, { Shape: BallShape, Mass: 1, Layer: CollisionLayer.Prop }),
	], { position: [(index % 4) - 1.5, 3 + index * 1.2, Math.floor(index / 4) - 1] });
}

export const BallPitScene: SceneManifest = {
	id: "ball-pit",
	name: "Ball pit",
	description: "Twelve balls fall into a box.",
	gravity: [0, -20, 0],
	clearColor: [0.1, 0.12, 0.18],
	entities: [
		StaticBox("Floor", [12, 1, 12], [0, -0.5, 0], [0.4, 0.45, 0.5]),
		StaticBox("Wall West", [1, 3, 12], [-6.5, 1.5, 0], [0.3, 0.33, 0.4]),
		StaticBox("Wall East", [1, 3, 12], [6.5, 1.5, 0], [0.3, 0.33, 0.4]),
		StaticBox("Wall North", [14, 3, 1], [0, 1.5, -6.5], [0.3, 0.33, 0.4]),
		StaticBox("Wall South", [14, 3, 1], [0, 1.5, 6.5], [0.3, 0.33, 0.4]),

		...Array.from({ length: 12 }, (_, index) => Ball(index)),

		Ent("Camera", [Comp(FixedCamera, { LookAt: [0, 1, 0], FovDegrees: 60 })], { position: [0, 9, 12] }),
		Ent("Hints", [Comp(HudText, { Lines: ["Esc - menu / scene select"] })]),
	],
};
```

## Шаг 2. Зарегистрируй сцену

В `Source/Game/GameScenes.ts`:

```ts
registry.Register(BouncingBallScene).Register(CharacterTestScene).Register(CoinHuntScene).Register(BallPitScene);
```

(не забудь `import { BallPitScene } from "./Scenes/BallPitScene";`). Первая зарегистрированная сцена грузится при старте,
остальные доступны в меню по `Esc`.

## Шаг 3. Запусти

`pnpm dev` → Play → `Esc` → выбери *Ball pit*. Шары должны упасть в коробку (если физика собрана — см. 01).

## Разбор

**`Ent(имя, компоненты, опции)`** — одна сущность. Опции: `position`, `rotation`, `tags`. Компоненты подключаются и потом
вызываются **в том порядке, в котором перечислены** — это важно (см. 04, платформы).

**`Comp(Тип, { поля })`** — «добавь этот компонент и выставь эти поля». Поля проверяются компилятором: опечатка
в имени поля или неверный тип — ошибка сборки. Устанавливаются только *данные* (не методы), сразу после создания, до `Awake`.

**Шар = два компонента, а не один.** Это ключевая мысль движка:

- `MeshRenderer` отвечает за то, **как выглядит** (меш + цвет);
- `RigidBody` отвечает за то, **как ведёт себя физически** (форма + масса + слои).

Они друг о друге не знают, поэтому форма коллайдера и меша не обязаны совпадать (невидимые стены, упрощённые коллайдеры
и т.д.). Чтобы не писать числа дважды, есть `MeshForShape(shape)` — меш тех же размеров.

**`Shapes.*`** — формы коллайдеров: `Box(w, h, d)` (полные размеры), `Sphere(r)`, `Capsule(r, полнаяВысота)`,
`Cylinder(r, h)`, `ConvexHull(точки)`, `TriangleMesh(вершины)` (только для статики). **`Meshes.*`** — то же для картинки.

**`StaticBox(...)`** из `Game/SceneHelpers.ts` — просто сокращение: сущность с боксом-мешем и статическим боксом-коллайдером.
Открой файл и посмотри, он короткий — так же пишутся твои собственные хелперы (`DynamicBox`, `DynamicShape` там же).

**Камера.** Сцене нужна сущность с компонентом-камерой. `FixedCamera` стоит на месте и смотрит в `LookAt`;
`CameraComponent` следует за игроком (см. 05). Если камеры нет — рендер остаётся с позицией по умолчанию.

**`gravity`, `clearColor`** — настройки мира сцены (при загрузке физический мир пересоздаётся с этой гравитацией).

## Типичные ошибки

| Симптом | Причина |
|---|---|
| Объект есть, но его не видно | Нет `MeshRenderer`, или у него не задан `Mesh` |
| Объект виден, но проваливается / висит | Нет тела (`StaticBody`/`RigidBody`) или физика не собрана |
| Шар застрял внутри пола | Позиция в манифесте уже внутри коллайдера: стартуй выше |
| Сцена не появилась в меню | Не зарегистрирована в `GameScenes.ts` или `id` совпадает с другой |
| Ошибка «Scene … is already registered» | Два `id` одинаковые |

## Упражнения

1. Сделай шары разного размера (`Shapes.Sphere(0.3 + …)`) и массы (`Mass`).
2. Добавь наклонную плоскость: `StaticBox(…, { rotationX: 0.4 })`.
3. Поменяй текст подсказки на экране: это поле `Lines` у компонента `HudText` (он уже стоит в сцене).

Дальше → [03. Свои компоненты](03-components.md)
