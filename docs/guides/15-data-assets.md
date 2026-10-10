# 15. Файлы данных `.csedata`

Как ScriptableObject в Unity, но в JSON: **класс в коде** говорит тип, поля и их значения по умолчанию, **файл**
даёт значения. Файлы не встраиваются в код сборки - они лежат рядом с игрой (`data/<Id>.csedata`), поэтому их
можно править **без пересборки**: в готовой игре на хостинге, а при разработке - в папке проекта (dev-сервер читает
их с диска при каждом запросе, правка видна после перезагрузки страницы).

Код: `Core/Source/Engine/Data/DataAsset.ts`.

## Класс

```ts
// Templates/CoinHunt/Source/Data/CoinHuntRules.ts
import { DataAsset } from "@cse/core/Engine/Data/DataAsset";

export class CoinHuntRules extends DataAsset {
	public static readonly AssetType = "CoinHuntRules";
	public TimeLimitSeconds = 60;
	public TimeLimitChoices = [30, 60, 90];
}
```

## Файл

```json
{
  "FileVersion": 1,
  "Type": "CoinHuntRules",
  "Values": { "TimeLimitSeconds": 45, "TimeLimitChoices": [30, 45, 90] }
}
```

Поля, которых нет в файле, берут значения класса. Ошибки называют файл и поле: чужой `Type`, неизвестное поле,
значение не того вида (число, строка, true/false, список, объект - по значению по умолчанию в классе), файл новее
движка. Сборка проверяет, что файл - это JSON; поля проверяет игра по классу.

## В проекте

Дескриптор перечисляет файлы по Id:

```json
"Data": [{ "Id": "CoinHuntRules", "Path": "Content/Data/CoinHuntRules.csedata" }]
```

Игра загружает все файлы данных проекта при старте (они маленькие), дальше читает их сразу:

```ts
const rules = this.Engine.Data.Get(CoinHuntRules, "CoinHuntRules");          // файл обязателен
const view = this.Engine.Data.GetOrDefault(FirstPersonView, "FirstPersonView"); // без файла - значения класса
```

Экземпляр создаётся один раз и общий. Файл, который не удалось загрузить, пишется в лог по имени, а игра
стартует; он назовёт себя снова, когда игра его попросит.

## Что хранят шаблоны

Настройки проектов, не связанные с управлением (управление - в файлах управления, гайд 14):

| Шаблон | Файл | Что в нём |
|---|---|---|
| Coin Hunt | `CoinHuntRules` | лимит времени по умолчанию, варианты лимита в настройках |
| First Person | `FirstPersonView` | поле зрения: значение, пределы и шаг настройки |
| Third Person | `ThirdPersonCamera` | дистанция камеры: значение, пределы и шаг настройки |
| Top-Down | `TopDownCamera` | приближение и его пределы, наклон вблизи и вдали, прокрутка от края по умолчанию |

Значения из этих файлов - то, с чего начинает игрок; что он выбрал сам, хранит `SettingsStorage` (гайд 14).
Games Sample перечисляет файлы данных всех шаблонов.
