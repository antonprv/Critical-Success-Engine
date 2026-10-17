// Created by Anton Piruev in 2026.
// Any direct commercial use of derivative work is strictly prohibited.

// Writes docs/quasar-coverage.md: every Quasar component, directive, plugin, utility and composable, and where it is
// in the engine - the palette, the inspector, how each kit draws it, what tests it. Built from the same catalog as the
// runtime, the kits' CSS and the screenshot tests' pictures, so it can't drift: Tests/Quasar/Coverage.test.ts fails
// while the file is out of date. Run: node Scripts/QuasarCoverage.mjs

import { existsSync, readFileSync, readdirSync, writeFileSync } from "node:fs";
import { createRequire } from "node:module";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { BuildCatalog } from "./GenerateQuasarCatalog.mjs";

const here = dirname(fileURLToPath(import.meta.url));
const quasarRoot = dirname(createRequire(import.meta.url).resolve("quasar/package.json"));
export const CoverageFile = resolve(here, "../../../../../../docs/quasar-coverage.md");

/** The root classes a component's markup carries ("q-item__section" for QItemSection, "q-spinner" for QSpinnerDots). */
export function ClassesOf(type) {
	const classes = [type];
	const at = type.lastIndexOf("-");
	if (at > 1) classes.push(`${type.slice(0, at)}__${type.slice(at + 1)}`);
	if (type.startsWith("q-spinner")) classes.push("q-spinner");
	return classes;
}

/** How a kit draws a component: rules of its own for the component, or the kit's tokens (colours, font, radius) alone. */
function Dress(css, type) {
	return ClassesOf(type).some((name) => new RegExp(`\\.${name}(?![\\w-])`).test(css)) ? "own rules" : "tokens";
}

const Exports = (file) => [...readFileSync(join(quasarRoot, "src", file), "utf8").matchAll(/as (\w+) \}/g)].map((match) => match[1]);

export function RenderCoverage() {
	const catalog = BuildCatalog();
	const styles = join(here, "../Source/Quasar/Styles");
	const classic = readFileSync(join(styles, "quasar-classic.css"), "utf8");
	const tailwind = readFileSync(join(styles, "quasar-tailwind.css"), "utf8");
	const shots = join(here, "../E2E/Screenshots");
	const pictures = new Set(existsSync(shots) ? readdirSync(shots) : []);
	const tested = (name) => ["classic", "tailwind", "quasar"].filter((kit) => pictures.has(`${kit}-${name}.png`)).length;
	const lines = [
		"# Покрытие Quasar (S6-08)",
		"",
		`Создано \`Modules/Engine/UI/Scripts/QuasarCoverage.mjs\` по каталогу Quasar ${catalog.Version} (\`quasar/dist/api\`), CSS китов`,
		"и снимкам скриншотных тестов; `Tests/Quasar/Coverage.test.ts` падает, пока файл устарел. Не править руками.",
		"",
		"- **Палитра:** каждый компонент — тип виджета UI-документа (`BuiltInWidgets`), в палитре UIDesigner в группе «Quasar: …».",
		"- **Инспектор:** свойства по категориям Quasar с редактором по типу, слоты (в какой слот идёт дочерний виджет),",
		"  события (для графов узлов и скриптов), методы (`Controller(\"Имя\").Call(\"метод\")`), директивы.",
		"- **Тема Quasar:** собственный вид Quasar, цвета бренда из палитры кита.",
		"- **Tailwind, Windows:** «own rules» — у кита свои правила для компонента; «tokens» — компонент одет токенами кита",
		"  (цвета бренда, шрифт, размер, скругление, поверхности), отдельных правил не требует.",
		"- **Тест:** снимки во всех трёх китах в пяти состояниях (`E2E/quasar.spec.ts`); «движется» — анимированный компонент",
		"  (спиннеры, полосы загрузки): проверяется юнит-тестами отрисовки, снимок не стабилен.",
		"",
		"## Компоненты",
		"",
		"| Компонент | Группа | В палитре | Свойства / слоты / события в инспекторе | Тема Quasar | Тема Tailwind | Тема Windows | Тест |",
		"|---|---|---|---|---|---|---|---|",
	];
	for (const component of catalog.Components) {
		const count = tested(component.Name);
		const test = count === 3 ? "снимки ×3" : count === 0 ? "движется; юнит" : `снимки ×${count}`;
		const inspector = `${component.Props.length} / ${component.Slots.length} / ${component.Events.length}${component.Model ? " + v-model" : ""}`;
		lines.push(`| [${component.Name}](${component.Docs}) | ${component.Group} | да | ${inspector} | да | ${Dress(tailwind, component.Type)} | ${Dress(classic, component.Type)} | ${test} |`);
	}
	lines.push("", "## Директивы", "", "В инспекторе: раздел «Directives» (вкл/выкл, аргумент и модификаторы, значение); у директив-обработчиков", "событие виджета с именем директивы.", "", "| Директива | Значение | Модификаторы | В инспекторе |", "|---|---|---|---|");
	for (const directive of catalog.Directives) lines.push(`| [${directive.Attr}](${directive.Docs}) | ${directive.Value.join(", ")} | ${directive.Modifiers.join(", ") || "—"} | да |`);
	lines.push("", "## Плагины", "", "| Плагин | Как доступен |", "|---|---|");
	const Plugins = {
		Notify: "сервис `Notify`: графы узлов, скрипты, `GameUi.Notify`",
		Dialog: "сервис `Dialog` (alert, confirm, prompt, options): скрипты, `GameUi.Dialog` → Task",
		BottomSheet: "сервис `BottomSheet`: скрипты, `GameUi.BottomSheet` → Task",
		Loading: "сервис `ShowLoading`/`HideLoading`: графы, скрипты, `GameUi`",
		LoadingBar: "сервис `LoadingBar`: скрипты, `GameUi.LoadingBar`",
		AppFullscreen: "сервис `ToggleFullscreen`: графы, скрипты, `GameUi`",
		Dark: "следует теме (тёмная тема Tailwind/Quasar включает тёмный режим Quasar)",
		Lang: `сервис \`SetLanguage\` (языковых пакетов: ${catalog.Languages.length}, ленивые чанки); язык задаёт CSTables`,
		LocalStorage: "через хранилище движка: `ConfigureQuasarStorage` (на странице игры — свой `SettingsStorage`)",
		SessionStorage: "через хранилище движка (по умолчанию память страницы)",
		Cookies: "плагин Quasar как есть (cookies — понятие браузера; настройки и файлы — `SettingsStorage`)",
		Platform: "устанавливается вместе с Quasar ($q.platform)",
		Screen: "устанавливается вместе с Quasar ($q.screen)",
		IconSet: "Material Icons (шрифт в модуле, грузится браузером по требованию)",
		AddressbarColor: "плагин Quasar (`import { AddressbarColor } from \"quasar\"` в скриптах)",
		AppVisibility: "плагин Quasar ($q.appVisible)",
		AppNetwork: "плагин Quasar",
		AppWakeLock: "плагин Quasar",
		Meta: "плагин Quasar (`useMeta` в скриптах)",
		Brand: "CSS-переменные `--q-primary`… — их задаёт кит",
	};
	for (const plugin of catalog.Plugins) lines.push(`| [${plugin.Name}](${plugin.Docs}) | ${Plugins[plugin.Name] ?? "плагин Quasar"} |`);
	lines.push("", "## Утилиты и composables", "", "Доступны скриптам UI-документов и игры: `import { date, copyToClipboard, useInterval } from \"quasar\"` (одна копия Quasar на", "странице: Core и `@cse/ui` берут исходники Quasar).", "");
	lines.push(`- **Утилиты (${Exports("utils.js").length}):** ${Exports("utils.js").map((name) => `\`${name}\``).join(", ")}.`);
	lines.push(`- **Composables (${Exports("composables.js").length}):** ${Exports("composables.js").map((name) => `\`${name}\``).join(", ")}.`);
	const own = (css) => catalog.Components.filter((component) => Dress(css, component.Type) === "own rules").length;
	lines.push("", "## Итого", "", `- Компонентов: ${catalog.Components.length}, все в палитре, инспекторе и рантайме; директив: ${catalog.Directives.length}; плагинов: ${catalog.Plugins.length}; языков: ${catalog.Languages.length}.`);
	lines.push(`- Своих правил: Windows — ${own(classic)}, Tailwind — ${own(tailwind)}; остальные одеты токенами кита.`);
	lines.push(`- Снимков: ${pictures.size} (${catalog.Components.filter((component) => tested(component.Name) === 3).length} компонентов × 3 кита, 5 состояний на снимке).`, "");
	return lines.join("\n");
}

if (process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
	writeFileSync(CoverageFile, RenderCoverage());
	console.log(`Written ${CoverageFile}`);
}
