// Left and Right on a line holding right-to-left text: its caret places in the order they stand on the line
import type { Affinity } from '../contracts/geometryTypes';
import type { LineBox, LineFragment } from '../contracts/layoutTypes';
import { hasPositions } from './lineIndex';

type PlacedFragment = LineFragment & { kind: 'text' | 'atomic' };
export type VisualPlace = { readonly offset: number; readonly affinity: Affinity; readonly x: number; readonly fragment: PlacedFragment };
export type LineStep =
	| { readonly kind: 'place'; readonly place: VisualPlace }
	| { readonly kind: 'leaf'; readonly from: number; readonly past: VisualPlace }
	| { readonly kind: 'edge' };

const SAME_X = 0.5;

export function holdsRightToLeft(line: LineBox): boolean {
	return line.fragments.some((fragment) => fragment.kind === 'text' && fragment.level % 2 === 1);
}

function placesOf(fragment: PlacedFragment, stops: readonly number[], xOf: (offset: number, affinity: Affinity) => number): VisualPlace[] {
	const places = stops
		.filter((stop) => stop >= fragment.from && stop <= fragment.to)
		.map((offset): VisualPlace => {
			const affinity: Affinity = offset === fragment.to ? -1 : 1;
			return { offset, affinity, x: xOf(offset, affinity), fragment };
		});
	// shaping changes the measured x of stops inside a run, so a run's stops keep their text order
	if (fragment.kind === 'text') return fragment.level % 2 === 1 ? places.reverse() : places;
	return places.sort((a, b) => a.x - b.x);
}

/** every caret place of the line, left to right; a stop two fragments share stands once in each */
export function visualPlaces(line: LineBox, stops: readonly number[], xOf: (offset: number, affinity: Affinity) => number): VisualPlace[] {
	const fragments = line.fragments.filter((fragment): fragment is PlacedFragment => hasPositions(fragment) && fragment.to > fragment.from);
	return [...fragments].sort((a, b) => a.x - b.x).flatMap((fragment) => placesOf(fragment, stops, xOf));
}

/** the leaf's edge on the side `dir` */
export function leafExit(places: readonly VisualPlace[], from: number, dir: -1 | 1): VisualPlace | null {
	const edges = places.filter((place) => place.fragment.kind === 'atomic' && place.fragment.from === from);
	return (dir > 0 ? edges[edges.length - 1] : edges[0]) ?? null;
}

export function stepOnLine(places: readonly VisualPlace[], at: number, dir: -1 | 1): LineStep {
	const from = places[at];
	let next = at + dir;
	// the next fragment's near edge is the same place on the line
	while (places[next] && places[next].fragment !== places[next - dir].fragment && Math.abs(places[next].x - from.x) < SAME_X) next += dir;
	const place = places[next];
	if (!place) return { kind: 'edge' };
	const crossed = place.fragment.kind === 'atomic' && leafExit(places, place.fragment.from, dir) === place;
	return crossed ? { kind: 'leaf', from: place.fragment.from, past: place } : { kind: 'place', place };
}

/** the fragment's first place for a key going `dir` */
export function nearEdge(places: readonly VisualPlace[], fragment: VisualPlace['fragment'], dir: -1 | 1): VisualPlace {
	const own = places.filter((place) => place.fragment === fragment);
	return dir > 0 ? own[0] : own[own.length - 1];
}

/** the logical direction a key going `dir` reads the fragment in */
export function readingDir(fragment: VisualPlace['fragment'], dir: -1 | 1): -1 | 1 {
	return fragment.kind === 'text' && fragment.level % 2 === 1 ? (-dir as -1 | 1) : dir;
}
