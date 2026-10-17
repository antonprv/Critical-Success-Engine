// Created by Anton Piruev in 2026.
// Any direct commercial use of derivative work is strictly prohibited.

import { describe, expect, it, vi } from "vitest";
import {
	DataStream, DataTag, LinkStreams, Observable, ReactiveProperty,
	WorkerLink, type StreamLink,
} from "../Source/Index.ts";

interface Damage {
	Amount: number;
	Source: string;
}

describe( "DataTag", () => {
	it( "is interned: one tag object (and id) per name", () => {
		const a = DataTag.For<Damage>( "Test.Damage" );
		expect( DataTag.For<Damage>( "Test.Damage" ) ).toBe( a );
		expect( DataTag.For( "Test.Other" ).Id ).not.toBe( a.Id );
		expect( a.Name ).toBe( "Test.Damage" );
		expect( String( a ) ).toBe( "Test.Damage" );
	} );
} );

describe(
	"DataStream: publishers and subscribers don't know each other",
	() => {
		it(
			"delivers a message to every subscriber of its tag, in order, "
			+ "synchronously",
			() => {
				const stream = new DataStream();
				const damage = DataTag.For<Damage>( "Damage" );
				const got: string[] = [];
				stream.Subscribe(
					damage,
					( d ) => got.push( `a:${ d.Amount }` ),
				);
				stream.Subscribe(
					"Damage",
					( d: Damage ) => got.push( `b:${ d.Source }` ),
				);
				stream.Subscribe( "Heal", () => got.push( "heal" ) );

				stream.Publish( damage, { Amount: 5, Source: "Trap" } );
				expect( got ).toEqual( ["a:5", "b:Trap"] );
				expect( stream.SubscriberCount( damage ) ).toBe( 2 );
				expect( stream.SubscriberCount( "Nothing" ) ).toBe( 0 );
			},
		);

		it(
			"a message nobody listens to costs nothing and goes nowhere",
			() => {
				const stream = new DataStream();
				expect( () => stream.Publish( "Nobody", 1 ) ).not.toThrow();
			},
		);

		it(
			"disposing a subscription stops it, even in the middle of a "
				+ "delivery",
			() => {
				const stream = new DataStream();
				const got: number[] = [];
				const second = vi.fn();
				const first = stream.Subscribe( "T", ( v: number ) => {
					got.push( v );
					// removes the second one during this delivery
					subscription.Dispose();
				} );
				const subscription = stream.Subscribe( "T", second );
				stream.Publish( "T", 1 );
				expect( second ).not.toHaveBeenCalled();
				first.Dispose();
				first.Dispose(); // twice is fine
				expect( first.Disposed ).toBe( true );
				stream.Publish( "T", 2 );
				expect( got ).toEqual( [1] );
				expect( stream.SubscriberCount( "T" ) ).toBe( 0 );
			},
		);

		it( "several subscribers can leave during one delivery", () => {
			const stream = new DataStream();
			const got: string[] = [];
			const subscriptions = ["a", "b", "c"].map(
				( name ) => stream.Subscribe( "T", () => {
					got.push( name );
					subscriptions.forEach(
						( subscription ) => subscription.Dispose(),
					);
				} ),
			);
			stream.Publish( "T", 1 );
			stream.Publish( "T", 2 );
			expect( got ).toEqual( ["a"] );
		} );

		it(
			"a subscriber added during a delivery gets the next message, not "
				+ "this "
			+ "one",
			() => {
				const stream = new DataStream();
				const late = vi.fn();
				const once = stream.Subscribe( "T", () => {
					stream.Subscribe( "T", late );
					once.Dispose();
				} );
				stream.Publish( "T", 1 );
				expect( late ).not.toHaveBeenCalled();
				stream.Publish( "T", 2 );
				expect( late ).toHaveBeenCalledWith( 2 );
			},
		);

		it(
			"a throwing subscriber doesn't stop the others; the error is "
				+ "reported",
			() => {
				const errors: unknown[] = [];
				const stream = new DataStream(
					{ OnError: ( e ) => errors.push( e ) },
				);
				const after = vi.fn();
				stream.Subscribe( "T", () => {
					throw new Error( "boom" );
				} );
				stream.Subscribe( "T", after );
				stream.Publish( "T", 1 );
				expect( after ).toHaveBeenCalled();
				expect( ( errors[0] as Error ).message ).toBe( "boom" );

				const quiet = new DataStream();
				const report = vi.spyOn( console, "error" )
					.mockImplementation( () => {
					} );
				quiet.Subscribe( "T", () => {
					throw new Error( "default" );
				} );
				quiet.Publish( "T", 1 );
				expect( report ).toHaveBeenCalled();
				report.mockRestore();
			},
		);

		it(
			"Post queues (a ring buffer) and Flush delivers in order, messages "
			+ "posted while flushing included",
			() => {
				const stream = new DataStream( { QueueCapacity: 2 } );
				const got: number[] = [];
				stream.Subscribe( "N", ( n: number ) => {
					got.push( n );
					if ( n === 1 ) {
						stream.Post( "N", 100 );
					}
				} );
				for ( let i = 1; i <= 5; i++ ) {
					stream.Post( "N", i ); // grows past the capacity of 2
				}
				expect( got ).toEqual( [] );
				expect( stream.Pending ).toBe( 5 );
				stream.Flush();
				expect( got ).toEqual( [1, 2, 3, 4, 5, 100] );
				expect( stream.Pending ).toBe( 0 );

				// wrap around the ring: post and flush in turns
				got.length = 0;
				for ( let round = 0; round < 6; round++ ) {
					stream.Post( "N", 10 + round );
					stream.Post( "N", 20 + round );
					stream.Flush();
				}
				expect( got )
					.toEqual(
						[10, 20, 11, 21, 12, 22, 13, 23, 14, 24, 15, 25],
					);
			},
		);

		it( "Clear drops every subscriber and queued message", () => {
			const stream = new DataStream();
			const handler = vi.fn();
			stream.Subscribe( "T", handler );
			stream.Post( "T", 1 );
			stream.Clear();
			stream.Flush();
			stream.Publish( "T", 2 );
			expect( handler ).not.toHaveBeenCalled();
		} );
	},
);

describe( "Observable: R3-style operators over a tag", () => {
	it(
		"Where, Select, Skip, Take, DistinctUntilChanged chain without "
			+ "intermediate subjects",
		() => {
			const stream = new DataStream();
			const got: string[] = [];
			const subscription = stream.Observe<Damage>( "Damage" )
				.Where( ( d ) => d.Amount > 0 )
				.Select( ( d ) => d.Source )
				.DistinctUntilChanged()
				.Skip( 1 )
				.Take( 2 )
				.Subscribe( ( source ) => got.push( source ) );

			for ( const [amount, source] of [
				[1, "a"],
				[0, "zero"],
				[2, "b"],
				[3, "b"],
				[4, "c"],
				[5, "d"],
			] as const ) {
				stream.Publish( "Damage", { Amount: amount, Source: source } );
			}
			expect( got ).toEqual( ["b", "c"] );
			// Take(2) let go of the tag
			expect( stream.SubscriberCount( "Damage" ) ).toBe( 0 );
			subscription.Dispose();
		},
	);

	it(
		"Merge, Subscribe with an error handler, and Observable.From for "
			+ "anything with a subscribe",
		() => {
			const stream = new DataStream();
			const got: unknown[] = [];
			const merged = Observable.Merge(
				stream.Observe<number>( "A" ),
				stream.Observe<number>( "B" ),
			);
			const subscription = merged.Subscribe( ( v ) => got.push( v ) );
			stream.Publish( "A", 1 );
			stream.Publish( "B", 2 );
			subscription.Dispose();
			stream.Publish( "A", 3 );
			expect( got ).toEqual( [1, 2] );

			const errors: unknown[] = [];
			const failing = Observable.From<number>( ( next ) => {
				next( 1 );
				return () => {
				};
			} ).Select( () => {
				throw new Error( "select" );
			} );
			failing.Subscribe( () => {
			}, ( e ) => errors.push( e ) );
			Observable.From<number>( ( next ) => {
				next( 1 );
				return () => {
				};
			} ).Subscribe( () => {
				throw new Error( "next" );
			}, ( e ) => errors.push( e ) );
			expect( ( errors[1] as Error ).message ).toBe( "next" );
			expect( ( errors[0] as Error ).message ).toBe( "select" );
			expect( () => failing.Subscribe( () => {
			} ) ).toThrow( "select" );
		},
	);

	it(
		"Take(0) completes at once; disposing early releases the source",
		() => {
			const stream = new DataStream();
			const handler = vi.fn();
			stream.Observe( "T" ).Take( 0 )
				.Subscribe( handler )
				.Dispose();
			expect( stream.SubscriberCount( "T" ) ).toBe( 0 );
			const subscription = stream.Observe( "T" ).Take( 3 )
				.Subscribe( handler );
			subscription.Dispose();
			stream.Publish( "T", 1 );
			expect( handler ).not.toHaveBeenCalled();
		},
	);

	it(
		"Take ends even when the source delivers synchronously while "
			+ "subscribing",
		() => {
			const values = Observable.From<number>( ( next ) => {
				next( 1 );
				next( 2 );
				next( 3 );
				return () => {
				};
			} );
			const got: number[] = [];
			values.Take( 2 ).Subscribe( ( v ) => got.push( v ) );
			expect( got ).toEqual( [1, 2] );
		},
	);
} );

describe( "ReactiveProperty", () => {
	it(
		"gives its current value to a new subscriber, then each change; equal "
			+ "values are not changes",
		() => {
			const health = new ReactiveProperty( 100 );
			const got: number[] = [];
			const subscription = health.Subscribe( ( v ) => got.push( v ) );
			health.Value = 90;
			health.Value = 90;
			health.Value = 80;
			subscription.Dispose();
			health.Value = 70;
			expect( got ).toEqual( [100, 90, 80] );
			expect( health.Value ).toBe( 70 );
			expect( health.Observe().Where( ( v ) => v < 50 ) )
				.toBeInstanceOf( Observable );
		},
	);

	it(
		"can publish its changes on a tag, so others react without knowing it",
		() => {
			const stream = new DataStream();
			const score = new ReactiveProperty( 0 ).PublishTo(
				stream,
				"Score",
			);
			const got: number[] = [];
			stream.Subscribe( "Score", ( v: number ) => got.push( v ) );
			score.Value = 10;
			expect( got ).toEqual( [10] );
			score.Dispose();
			score.Value = 20;
			expect( got ).toEqual( [10] );
		},
	);
} );

describe(
	"Links: one stream across workers, or between TypeScript and C#",
	() => {
		it(
			"a message crosses only to tags the other side subscribed to, as "
			+ "MessagePack, on Flush",
			() => {
				const main = new DataStream();
				const worker = new DataStream();
				const sent: number[] = [];
				LinkStreams(
					main,
					worker,
					( bytes ) => sent.push( bytes.length ),
				);

				const got: Damage[] = [];
				const subscription = worker.Subscribe(
					"Damage",
					( d: Damage ) => got.push( d ),
				);
				worker.Flush(); // the subscription goes over
				main.Flush();

				main.Publish( "Damage", { Amount: 5, Source: "Trap" } );
				// nobody on the other side: not sent
				main.Publish( "Unwatched", 1 );
				expect( got ).toEqual( [] ); // not before the flush
				main.Flush();
				expect( got ).toEqual( [{ Amount: 5, Source: "Trap" }] );

				subscription.Dispose();
				worker.Flush();
				main.Publish( "Damage", { Amount: 1, Source: "x" } );
				main.Flush();
				expect( got ).toHaveLength( 1 );
				expect( sent.length ).toBeGreaterThan( 0 );
			},
		);

		it(
			"messages from the other side reach local subscribers but are not "
			+ "echoed back",
			() => {
				const a = new DataStream();
				const b = new DataStream();
				LinkStreams( a, b );
				const onA = vi.fn();
				const onB = vi.fn();
				a.Subscribe( "Ping", onA );
				b.Subscribe( "Ping", onB );
				a.Flush();
				b.Flush();
				a.Publish( "Ping", 1 );
				a.Flush();
				b.Flush();
				a.Flush();
				expect( onA ).toHaveBeenCalledTimes( 1 );
				expect( onB ).toHaveBeenCalledTimes( 1 );
			},
		);

		it(
			"a tag subscribed twice is announced once and withdrawn after the "
				+ "last",
			() => {
				const stream = new DataStream();
				const batches: unknown[] = [];
				const link: StreamLink = {
					Send: ( bytes ) => batches.push( bytes ),
					OnReceive: () => {
					},
				};
				stream.Connect( link );
				const one = stream.Subscribe( "T", () => {
				} );
				const two = stream.Subscribe( "T", () => {
				} );
				stream.Flush();
				expect( batches ).toHaveLength( 1 );
				one.Dispose();
				stream.Flush();
				// still one subscriber: nothing to say
				expect( batches ).toHaveLength( 1 );
				two.Dispose();
				stream.Flush();
				expect( batches ).toHaveLength( 2 );
				stream.Disconnect();
				stream.Subscribe( "U", () => {
				} );
				stream.Flush();
				expect( batches ).toHaveLength( 2 );
			},
		);

		it( "connecting late announces what is already subscribed", () => {
			const a = new DataStream();
			const b = new DataStream();
			const onB = vi.fn();
			const batches: Uint8Array[] = [];
			b.Subscribe( "Late", onB );
			const gone = b.Subscribe( "Gone", () => {
			} );
			gone.Dispose(); // no subscribers left: not announced
			LinkStreams( a, b, ( bytes ) => batches.push( bytes ) );
			b.Flush();
			expect( batches ).toHaveLength( 1 );
			a.Publish( "Late", "hi" );
			a.Flush();
			expect( onB ).toHaveBeenCalledWith( "hi" );
		} );

		it( "rejects a malformed batch", () => {
			const a = new DataStream();
			let receive: ( bytes: Uint8Array ) => void = () => {
			};
			a.Connect( { Send: () => {
			}, OnReceive: ( r ) => {
				receive = r;
			} } );
			expect( () => receive( Uint8Array.of( 0x91, 0x09 ) ) )
				.toThrow( /DataStream/ );
			// [[7, "T"]]: an entry kind that doesn't exist
			expect(
				() => receive( Uint8Array.of( 0x91, 0x92, 0x07, 0xa1, 0x54 ) ),
			)
				.toThrow( /kind 7/ );
		} );

		it(
			"WorkerLink carries the batches over a MessagePort-like object, "
			+ "transferring the bytes",
			() => {
				const posted: { data: unknown; transfer: unknown; }[] = [];
				let onmessage: ( ( e: { data: unknown; } ) => void )
					| null = null;
				const port = {
					postMessage: (
						data: unknown,
						transfer: ArrayBuffer[],
					) => (
						posted.push( { data, transfer } )
					),
					addEventListener: (
						_: "message",
						listener: ( e: { data: unknown; } ) => void,
					) => {
						onmessage = listener;
					},
				};
				const stream = new DataStream();
				stream.Connect( WorkerLink( port ) );
				stream.Subscribe( "T", () => {
				} );
				stream.Flush();
				expect( posted[0]!.data ).toBeInstanceOf( Uint8Array );
				expect( posted[0]!.transfer )
					.toEqual( [( posted[0]!.data as Uint8Array ).buffer] );

				const got = vi.fn();
				stream.Subscribe( "FromWorker", got );
				const other = new DataStream();
				other.Connect(
					{
						Send: ( bytes ) => onmessage!( { data: bytes } ),
						OnReceive: () => {
						},
					},
				);
				// the other side "subscribed" nothing, so it sends a message
				// batch by hand: announce + message
				other.Publish( "FromWorker", 1 ); // not announced: dropped
				onmessage!( { data: "not bytes" } ); // ignored
				expect( got ).not.toHaveBeenCalled();
				// [[2, "FromWorker", 7]]: a message from the worker
				onmessage!(
					{
						data: Uint8Array.of(
							0x91,
							0x93,
							0x02,
							0xaa,
							...new TextEncoder().encode( "FromWorker" ),
							0x07,
						),
					},
				);
				expect( got ).toHaveBeenCalledWith( 7 );
			},
		);
	},
);
