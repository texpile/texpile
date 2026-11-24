// track sizing for grid templates: lengths, auto, fr, minmax, min-content, max-content, fit-content and repeat (5.1)

export type TrackSize =
	| { kind: 'length'; px: number }
	| { kind: 'fr'; fr: number }
	| { kind: 'auto' }
	| { kind: 'min-content' }
	| { kind: 'max-content' }
	| { kind: 'fit-content'; limit: number }
	| { kind: 'minmax'; min: TrackSize; max: TrackSize };

/** an item's contribution to the tracks it spans: its min-content and max-content sizes with its margins */
export type GridItemSizes = { readonly start: number; readonly span: number; readonly min: number; readonly max: number };

export type TrackContext = { readonly available: number | null; readonly fontPx: number; readonly gap: number };

const UNIT_PX: Record<string, number> = { px: 1, pt: 4 / 3, pc: 16, in: 96, cm: 96 / 2.54, mm: 96 / 25.4, q: 96 / 101.6 };
const AUTO: TrackSize = { kind: 'auto' };

/** a top-level split on spaces, parentheses kept whole */
function tokensOf(text: string): string[] {
	const tokens: string[] = [];
	let depth = 0;
	let current = '';
	for (const char of text.trim()) {
		if (char === '(') depth++;
		if (char === ')') depth--;
		if (/\s/.test(char) && depth === 0) {
			if (current) tokens.push(current);
			current = '';
		} else current += char;
	}
	if (current) tokens.push(current);
	return tokens;
}

function lengthOf(token: string, context: TrackContext): number | null {
	const match = /^(-?[\d.]+(?:e[-+]?\d+)?)(px|pt|pc|in|cm|mm|q|em|rem|%)?$/i.exec(token);
	if (!match) return null;
	const value = parseFloat(match[1]);
	const unit = (match[2] ?? 'px').toLowerCase();
	if (unit === '%') return context.available === null ? null : (value / 100) * context.available;
	if (unit === 'em') return value * context.fontPx;
	if (unit === 'rem') return value * 16;
	return value * (UNIT_PX[unit] ?? 1);
}

function sizeOf(token: string, context: TrackContext): TrackSize {
	const name = token.toLowerCase();
	if (name === 'auto' || name === 'none') return AUTO;
	if (name === 'min-content' || name === 'max-content') return { kind: name };
	if (name.endsWith('fr')) {
		const fr = parseFloat(name);
		return Number.isFinite(fr) ? { kind: 'fr', fr } : AUTO;
	}
	const minmax = /^minmax\((.*)\)$/i.exec(token);
	if (minmax) {
		const [min = 'auto', max = 'auto'] = minmax[1].split(',').map((part) => part.trim());
		return { kind: 'minmax', min: sizeOf(min, context), max: sizeOf(max, context) };
	}
	const fit = /^fit-content\((.*)\)$/i.exec(token);
	if (fit) return { kind: 'fit-content', limit: lengthOf(fit[1].trim(), context) ?? Infinity };
	const px = lengthOf(token, context);
	return px === null ? AUTO : { kind: 'length', px };
}

function fixedMinimum(track: TrackSize): number {
	if (track.kind === 'length') return track.px;
	if (track.kind === 'minmax') return fixedMinimum(track.min);
	return 0;
}

/** repeat(count, list): count a number, or auto-fill and auto-fit as many as the available room holds */
function repeated(body: string, context: TrackContext): TrackSize[] {
	const comma = body.indexOf(',');
	const count = body.slice(0, comma).trim().toLowerCase();
	const list = parseTrackList(body.slice(comma + 1), context);
	if (/^\d+$/.test(count)) return Array.from({ length: Number(count) }, () => list).flat();
	const each = list.reduce((sum, track) => sum + fixedMinimum(track), 0) + context.gap * list.length;
	const room = context.available === null || each <= 0 ? 1 : Math.floor((context.available + context.gap) / each);
	return Array.from({ length: Math.max(1, room) }, () => list).flat();
}

/** the tracks of a computed template, repeat() expanded; none gives no tracks */
export function parseTrackList(template: string, context: TrackContext): TrackSize[] {
	if (!template.trim() || template.trim() === 'none') return [];
	return tokensOf(template).flatMap((token) => {
		const repeat = /^repeat\((.*)\)$/i.exec(token);
		return repeat ? repeated(repeat[1], context) : [sizeOf(token, context)];
	});
}

type Working = {
	base: number;
	limit: number;
	flex: number;
	intrinsicMin: 'min' | 'max' | null;
	intrinsicMax: 'min' | 'max' | null;
	stretch: boolean;
};

function workingOf(track: TrackSize): Working {
	const none: Working = { base: 0, limit: Infinity, flex: 0, intrinsicMin: null, intrinsicMax: null, stretch: false };
	switch (track.kind) {
		case 'length':
			return { ...none, base: track.px, limit: track.px };
		case 'fr':
			return { ...none, flex: track.fr, intrinsicMin: 'min' };
		case 'auto':
			return { ...none, intrinsicMin: 'min', intrinsicMax: 'max', stretch: true };
		case 'min-content':
			return { ...none, intrinsicMin: 'min', intrinsicMax: 'min' };
		case 'max-content':
			return { ...none, intrinsicMin: 'max', intrinsicMax: 'max' };
		case 'fit-content':
			return { ...none, intrinsicMin: 'min', intrinsicMax: 'max', limit: track.limit };
		case 'minmax': {
			const min = workingOf(track.min);
			const max = workingOf(track.max);
			const flexible = track.max.kind === 'fr';
			return {
				base: track.min.kind === 'length' ? track.min.px : 0,
				limit: track.max.kind === 'length' ? track.max.px : Infinity,
				flex: flexible ? max.flex : 0,
				intrinsicMin: min.intrinsicMin && track.min.kind !== 'length' ? min.intrinsicMin : null,
				intrinsicMax: track.max.kind === 'length' || flexible ? null : max.intrinsicMax,
				stretch: track.max.kind === 'auto'
			};
		}
	}
}

/** spreads an item's need over the tracks it spans, in the ones that can take it */
function distribute(
	sizes: Working[],
	tracks: readonly number[],
	need: number,
	pick: (track: Working) => boolean,
	field: 'base' | 'limit'
): void {
	const takers = tracks.filter((i) => pick(sizes[i]));
	if (!takers.length || need <= 0) return;
	const share = need / takers.length;
	for (const i of takers) {
		const track = sizes[i];
		track[field] = (track[field] === Infinity ? 0 : track[field]) + share;
	}
}

/** the size of each track given the room (null: sized by content), its gaps and the items it holds */
export function sizeGridTracks(
	tracks: readonly TrackSize[],
	available: number | null,
	gap: number,
	items: readonly GridItemSizes[]
): number[] {
	const sizes = tracks.map(workingOf);
	function spanned(item: GridItemSizes): number[] {
		return Array.from({ length: item.span }, (_, i) => item.start + i).filter((i) => i < sizes.length);
	}
	const sorted = [...items].sort((a, b) => a.span - b.span);
	for (const item of sorted) {
		const covered = spanned(item);
		if (!covered.length) continue;
		const inner = gap * (covered.length - 1);
		function minimum(track: Working): number {
			return track.intrinsicMin === 'max' ? item.max : item.min;
		}
		if (covered.length === 1) {
			const track = sizes[covered[0]];
			if (track.intrinsicMin) track.base = Math.max(track.base, minimum(track));
			if (track.intrinsicMax)
				track.limit = Math.max(track.limit === Infinity ? 0 : track.limit, track.intrinsicMax === 'min' ? item.min : item.max);
			continue;
		}
		const have = covered.reduce((sum, i) => sum + sizes[i].base, 0) + inner;
		distribute(sizes, covered, item.min - have, (track) => !!track.intrinsicMin && track.flex === 0, 'base');
		const room = covered.reduce((sum, i) => sum + (sizes[i].limit === Infinity ? sizes[i].base : sizes[i].limit), 0) + inner;
		distribute(sizes, covered, item.max - room, (track) => !!track.intrinsicMax && track.limit !== Infinity, 'limit');
	}
	for (const track of sizes) {
		if (track.limit === Infinity && track.intrinsicMax && !track.flex) track.limit = track.base;
		track.limit = Math.max(track.limit, track.base);
	}
	const gaps = gap * Math.max(0, sizes.length - 1);
	if (available === null) {
		const flexItems = sizes.map((track, i) =>
			track.flex ? Math.max(0, ...sorted.filter((item) => item.span === 1 && item.start === i).map((item) => item.max / track.flex)) : 0
		);
		const fraction = Math.max(0, ...flexItems);
		return sizes.map((track) =>
			track.flex ? Math.max(track.base, fraction * track.flex) : track.limit === Infinity ? track.base : track.limit
		);
	}
	let free = available - gaps - sizes.reduce((sum, track) => sum + track.base, 0);
	const growing = sizes.filter((track) => track.flex === 0 && track.limit > track.base && track.limit !== Infinity);
	while (free > 1e-6 && growing.some((track) => track.limit > track.base)) {
		const open = growing.filter((track) => track.limit > track.base + 1e-9);
		const share = free / open.length;
		let used = 0;
		for (const track of open) {
			const add = Math.min(share, track.limit - track.base);
			track.base += add;
			used += add;
		}
		free -= used;
		if (used < 1e-9) break;
	}
	const flexible = sizes.filter((track) => track.flex > 0);
	if (flexible.length) {
		const settled = new Set<Working>();
		let fraction = 0;
		for (let round = 0; round <= flexible.length; round++) {
			const flexSum = flexible.filter((track) => !settled.has(track)).reduce((sum, track) => sum + track.flex, 0);
			const taken = sizes.reduce((sum, track) => sum + (track.flex && !settled.has(track) ? 0 : track.base), 0);
			fraction = Math.max(0, available - gaps - taken) / Math.max(flexSum, 1);
			const over = flexible.filter((track) => !settled.has(track) && track.base > fraction * track.flex);
			if (!over.length) break;
			for (const track of over) settled.add(track);
		}
		for (const track of flexible) if (!settled.has(track)) track.base = fraction * track.flex;
	} else if (free > 1e-6) {
		const stretching = sizes.filter((track) => track.stretch);
		for (const track of stretching) track.base += free / stretching.length;
	}
	return sizes.map((track) => track.base);
}
