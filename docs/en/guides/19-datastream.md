**English** | [Русский](../../ru/guides/19-datastream.md)

# 19. DataStream

The DataStream is how parts of a game talk without knowing each other: anything **publishes** a message on a **tag**,
anything **subscribes** to a tag. A coin does not look up the rules, the HUD does not hold the player: they share a
tag name and the shape of the data. The same stream connects TypeScript and C# components (guide 18), and can connect
threads.

## Publish and subscribe

```ts
// a TypeScript component
const subscription = this.Engine.Stream.Subscribe<{ Coin: string; }>( "Coin.Collected", ( coin ) => {
	this.Engine.Ui.Toast( `${ coin.Coin } picked up` );
} );
// ...somewhere else, knowing nothing of the subscriber
this.Engine.Stream.Publish( "Coin.Collected", { Coin: this.Entity.Name } );
// when done (OnDestroy)
subscription.Dispose();
```

```csharp
// a C# component: the same tag, its own type
public sealed record CoinCollected( string Coin );

public override void Start() => Engine.Stream.Subscribe<CoinCollected>( "Coin.Collected", coin => Engine.Log.Info( coin.Coin ) );
```

- `Publish` delivers **synchronously**, to the tag's subscribers in subscription order. A subscriber that throws is
  logged; the others still get the message.
- `Post` queues the message instead (a ring buffer) and `Flush` delivers the queue in order; the engine flushes once a
  frame.
- A tag can be a string or a `DataTag.For<T>( "Name" )`: tags are interned, so a delivery is an array lookup, not a
  string hash, and the type parameter keeps publishers and subscribers of a tag on the same type.
- Unsubscribing in the middle of a delivery is fine; a subscriber added during a delivery gets the next message.

## Operators (as in R3)

`Observe( tag )` gives the tag's messages as an `Observable`, with the operators of Cysharp's R3 that games use most:

```ts
this.Engine.Stream.Observe<Damage>( "Damage" )
	.Where( ( d ) => d.Amount > 0 )
	.Select( ( d ) => d.Source )
	.DistinctUntilChanged()
	.Take( 3 )
	.Subscribe( ( source ) => this.Engine.Ui.Toast( `hit by ${ source }` ) );
```

`Where`, `Select`, `Skip`, `Take` (lets go of the tag after the last one), `DistinctUntilChanged`, `Observable.Merge`.
Values arrive synchronously; nothing is allocated per value. C# has the same operators on `Engine.Stream.Observe<T>`.

`ReactiveProperty<T>` is a value that says when it changes: a subscriber gets the current value at once, then each
change; `PublishTo( stream, "Score" )` also puts the changes on a tag, so a HUD, a save system or a C# component can
follow it without a reference to its owner.

## Across TypeScript and C#, across threads

`Connect( link )` joins a stream to another one: the C# components' (the engine does this), another worker's
(`WorkerLink( port )`), or two streams of one thread (`LinkStreams( a, b )`). Across a link:

- a message goes only to tags the other side subscribes to (subscriptions are announced, and withdrawn after the last
  subscriber leaves): a tag nobody listens to over there costs nothing;
- messages travel in one MessagePack batch per `Flush`, and are delivered on the other side but never sent back;
- values are plain data: numbers, strings, booleans, arrays, objects, byte arrays. In C#, `MessageMapper` makes them the
  subscriber's class, struct or record (members matched by name, exact first, then ignoring case; positional records
  through their constructor; enums as numbers), and writes C#'s values back as plain data.

## MessagePack

The binary format of the batches (and the engine's binary format in general) is MessagePack, with a codec for each
language: `@cse/datastream` (`Encode`, `Decode`, `MessagePackWriter`, `MessagePackReader`) and `CSEngine.Messaging`
(`MessagePack`, `MessagePackWriter`, `MessagePackReader`). Both write exactly the same bytes for the same value: they are
tested against one file of vectors, `Modules/Common/DataStream/Tests/Vectors.json`.

Sources: `Modules/Common/DataStream` (TypeScript: `Source/`, C#: `DotNet/`).

← [18. Components in C#](18-csharp-scripting.md) · Next → [20. Dependency injection](20-dependency-injection.md)
