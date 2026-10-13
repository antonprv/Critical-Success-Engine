// Created by Anton Piruev in 2026.
// Any direct commercial use of derivative work is strictly prohibited.

const Conditions = [ "types", "import", "default", "require" ];

/**
 * A target of an export map entry: a path, or the first usable branch of a
 * conditions object.
 */
function PickTarget( target: unknown ): string | undefined {
	if ( typeof target === "string" ) {
		return target;
	}

	if ( Array.isArray( target ) ) {
		for ( const item of target ) {
			const picked = PickTarget( item );

			if ( picked !== undefined ) {
				return picked;
			}
		}
		return undefined;
	}

	if ( target !== null && typeof target === "object" ) {
		const record = target as Record<string, unknown>;

		for ( const condition of Conditions ) {
			const picked = PickTarget( record[condition] );

			if ( picked !== undefined ) {
				return picked;
			}
		}
	}
	return undefined;
}

/**
 * Resolves a subpath ("." or "./events") through a package's "exports": exact
 * keys and patterns with one star ("./Engine/*"), as the engine's own
 * package.json files use them. Returns the target relative to the package.
 */
export function ResolveExports( exports: unknown, subpath: string ): string
	| undefined {
	if ( exports === null
		|| typeof exports !== "object"
		|| Array.isArray( exports ) ) {
		return subpath === "."
			? PickTarget( exports )
			: undefined;
	}

	const map = exports as Record<string, unknown>;
	const keys = Object.keys( map );

	if ( !keys.some( ( key ) => key.startsWith( "." ) ) ) {
		return subpath === "."
			? PickTarget( map )
			: undefined;
	}

	if ( subpath in map ) {
		return PickTarget( map[subpath] );
	}

	let best: { Key: string; Prefix: number; Match: string } | undefined;

	for ( const key of keys ) {
		const star = key.indexOf( "*" );

		if ( star < 0 ) {
			continue;
		}

		const prefix = key.slice( 0, star );
		const suffix = key.slice( star + 1 );
		const fits = subpath.length >= prefix.length + suffix.length
			&& subpath.startsWith( prefix )
			&& subpath.endsWith( suffix );

		if ( fits && ( best === undefined || prefix.length > best.Prefix ) ) {
			best = {
				Key: key,
				Prefix: prefix.length,
				Match: subpath.slice(
					prefix.length,
					subpath.length - suffix.length,
				),
			};
		}
	}

	if ( best === undefined ) {
		return undefined;
	}
	return PickTarget( map[best.Key] )?.replaceAll( "*", best.Match );
}
