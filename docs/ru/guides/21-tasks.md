[English](../../en/guides/21-tasks.md) | **Русский**

# 21. Задачи (Task)

Асинхронные операции движка возвращают `Task` (`@cse/task`) вместо Promise: запросы физики (`SweepSphere`,
`SweepProjectile`, `IsAwake`), маркеры синхронизации физики и рендера, диалоги и окна сообщений (`ShowDialog`,
`MessageBox`), показ UI-документа, хранилище настроек. Task **является Promise** для всего, что ждёт Promise: его можно
ждать через `await`, передавать в `Promise.all`, возвращать там, где объявлен `Promise<T>`, — и добавляет то, что нужно
игре (по мотивам UniTask от Cysharp):

```ts
import { Task, CancellationTokenSource } from "@cse/task";

// ожидание в кадрах и игровом времени — по часам кадров движка, а не setTimeout
await Task.NextFrame();
await Task.DelayFrames( 10 );
await Task.Delay( 1.5 ); // игровые секунды

// состояние без ожидания
const hit = this._physics.SweepSphere( from, direction, 20, 0.5, CollisionLayer.Projectile, CollisionLayer.World );
if ( hit.IsCompleted ) { /* hit.Result */ }

// продолжение, которое выполняется в момент завершения — без микротаска и без Promise
hit.OnCompleted( ( task ) => this.Aim( task.Result ) );

// отмена: отменённое ожидание завершается ошибкой OperationCanceledError
const cancel = new CancellationTokenSource();
void Task.Delay( 10, cancel.Token );
cancel.Cancel();
```

Создаётся задача через `TaskCompletionSource` (то, чем был `new Promise( ( resolve, reject ) => ... )`):
`TrySetResult`, `TrySetError`, `TrySetCanceled`, при желании с привязкой к `CancellationToken`. Набор дополняют
`Task.FromResult`, `Task.FromError`, `Task.From( promise )`, `Task.WhenAll`, `Task.WhenAny`.

Зачем: в V8 ожидание Task через `await` стоит столько же, сколько ожидание Promise, а продолжение через `OnCompleted`
(и `then` у завершённой задачи) выполняется синхронно и примерно в 7 раз дешевле `Promise.then`, который всегда
выделяет память и идёт через очередь микротасков. Ожидания по кадрам завершаются ровно в нужный кадр, в такт игре,
что бы ни делали таймеры.

`async`-функции по-прежнему возвращают Promise (так устроен язык); Task они ждут как всё остальное.

← [20. Внедрение зависимостей](20-dependency-injection.md) · Дальше → [22. Контракты](22-contracts.md)
