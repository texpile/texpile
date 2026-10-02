// what an edit does to the suggestions in a file
import type { TextSpan } from './editGestures';
import {
	clearOfSuggestions,
	joinGestures,
	neutral,
	paragraphShape,
	snapToWords,
	textHunks,
	whitespaceChange,
	type Hunk
} from './suggestHunks';

export type EditMode = 'editing' | 'suggesting';

/** `lists` is `paragraphs` where the spaces before a list marker are the item's depth */
export type WhitespaceChanges = 'exact' | 'paragraphs' | 'lists';

export type TypingSide = 'before' | 'after';

// a point deletion takes typed words INTO it, so replacing a word reads as one change rather than an
// addition beside a deletion. Where the caret stands after a delete is not decided here: the gesture
// pins a side of its own (see caretSide), and only a spot with no pinned side falls back to this
export function defaultTypingSide(point: boolean, joins: boolean): TypingSide {
	return point || joins ? 'after' : 'before';
}

export type PlacedSuggestion = {
	id: string;
	from: number;
	to: number;
	restore: string;
	author: string;
};

export type SuggestionChange = { t: 'open' | 'revise' | 'close' | 'withdraw'; id: string };

export type CompareInput = {
	before: string;
	after: string;
	pending: PlacedSuggestion[];
	mode: EditMode;
	author: string;
	newId: () => string;
	gestures?: TextSpan[];
	sides?: Record<string, TypingSide>;
	whitespace?: WhitespaceChanges;
};

export type ComparedSuggestions = { placed: PlacedSuggestion[]; changes: SuggestionChange[] };

type Entry = {
	id: string;
	restore: string;
	author: string;
	fresh: boolean;
	from: number;
	to: number;
	fate?: 'close' | 'withdraw';
	point?: number;
};

function sameWords(text: string, s: { from: number; to: number; restore: string }, exact: boolean): boolean {
	const now = text.slice(s.from, s.to);
	if (exact) return now === s.restore;
	if (now.replace(/\s+/g, ' ') !== s.restore.replace(/\s+/g, ' ')) return false;
	let from = s.from;
	let to = s.to;
	while (from > 0 && /\s/.test(text[from - 1])) from--;
	while (to < text.length && /\s/.test(text[to])) to++;
	function shape(words: string) {
		return paragraphShape(text.slice(from, s.from) + words + text.slice(s.to, to));
	}
	return shape(now) === shape(s.restore);
}

// how far apart, and how many, neighboring suggestions are read together
const RUN_GAP = 64;
const RUN_LENGTH = 8;

/** one author's neighboring suggestions that together give back the words they took, as an undo can leave them */
function cancelledRuns(after: string, placed: { from: number; to: number; restore: string; author: string }[]): Set<number> {
	const out = new Set<number>();
	for (let i = 0; i < placed.length; i++) {
		let old = placed[i].restore;
		for (let j = i + 1; j < placed.length && j - i <= RUN_LENGTH; j++) {
			if (placed[j].author !== placed[i].author || placed[j].from < placed[j - 1].to) break;
			const gap = after.slice(placed[j - 1].to, placed[j].from);
			if (gap.length > RUN_GAP) break;
			old += gap + placed[j].restore;
			if (after.slice(placed[i].from, placed[j].to) === old) for (let k = i; k <= j; k++) out.add(k);
		}
	}
	return out;
}

export function compareSuggestions(o: CompareInput): ComparedSuggestions {
	const { before, after, mode, author: me } = o;
	const exact = o.whitespace === 'exact';
	const lists = o.whitespace === 'lists';
	const given = o.pending
		.filter((s) => s.from >= 0 && s.to >= s.from && s.to <= before.length)
		.sort((a, b) => a.from - b.from || a.to - b.to);
	if (before === after) return { placed: given, changes: [] };
	const typing = mode === 'suggesting' ? (o.gestures ?? []) : [];
	let hunks = clearOfSuggestions(textHunks(before, after), before, after, given, typing);
	if (mode === 'suggesting') {
		const words = snapToWords(hunks, before, after, given, exact, lists);
		hunks = joinGestures(words, before, after, typing, exact, lists);
	}
	if (hunks.length === 0) return { placed: given, changes: [] };

	const spotSides = new Map<number, TypingSide>();
	for (const s of given) if (s.restore && o.sides?.[s.id] && !spotSides.has(s.from)) spotSides.set(s.from, o.sides[s.id]);
	const typedAt = new Set(hunks.flatMap((h) => (h.aFrom === h.aTo ? [h.aFrom] : [])));
	const pending = given.flatMap((s) => {
		if (spotSides.get(s.from) !== 'after' || !s.restore || s.from === s.to || !typedAt.has(s.from)) return [s];
		if (mode === 'suggesting' && s.author === me) return [s];
		return [
			{ ...s, to: s.from },
			{ id: o.newId(), from: s.from, to: s.to, restore: '', author: s.author }
		];
	});

	let wa0 = hunks[0].aFrom;
	let wa1 = hunks[hunks.length - 1].aTo;
	for (let grew = true; grew;) {
		grew = false;
		for (const s of pending) {
			if (s.to < wa0 || s.from > wa1 || (s.from >= wa0 && s.to <= wa1)) continue;
			wa0 = Math.min(wa0, s.from);
			wa1 = Math.max(wa1, s.to);
			grew = true;
		}
	}
	const total = hunks.reduce((n, h) => n + (h.bTo - h.bFrom) - (h.aTo - h.aFrom), 0);
	const wb0 = wa0;
	const wb1 = wa1 + total;

	const entries: Entry[] = [];
	const outside: PlacedSuggestion[] = [];
	for (const s of pending) {
		if (s.to < wa0 || s.from > wa1) outside.push(s.from > wa1 ? { ...s, from: s.from + total, to: s.to + total } : s);
		else entries.push({ id: s.id, restore: s.restore, author: s.author, fresh: false, from: s.from, to: s.to });
	}

	const beforeOwner = new Int32Array(wa1 - wa0).fill(-1);
	entries.forEach((e, i) => beforeOwner.fill(i, e.from - wa0, e.to - wa0));
	const afterOwner = new Int32Array(wb1 - wb0).fill(-1);
	function isPoint(i: number) {
		return entries[i].from === entries[i].to;
	}
	function sideOf(i: number): TypingSide {
		const e = entries[i];
		return (!e.fresh && spotSides.get(e.from)) || defaultTypingSide(isPoint(i), mode === 'suggesting' && e.author === me);
	}
	function wordsTyped(side: TypingSide, at: number, skip: number): boolean {
		return entries.some((x, j) => j !== skip && !x.fate && !!x.restore && x.from === at && sideOf(j) === side);
	}

	function pointRelation(at: number): { hunk: Hunk; side: 'inside' | 'left' | 'right' } | { moved: number } {
		let d = 0;
		for (const h of hunks) {
			if (at < h.aFrom) return { moved: at + d };
			if (at === h.aFrom) return { hunk: h, side: 'left' };
			if (at < h.aTo) return { hunk: h, side: 'inside' };
			if (at === h.aTo && h.aTo > h.aFrom) return { hunk: h, side: 'right' };
			d += h.bTo - h.bFrom - (h.aTo - h.aFrom);
		}
		return { moved: at + d };
	}

	function neutralHere(h: Hunk, inserted: string, owners: Set<number>, acceptedGone: boolean): boolean {
		if (exact || !neutral(before, after, h, lists)) return false;
		if (entries.some((e, i) => isPoint(i) && !e.fate && e.from >= h.aFrom && e.from <= h.aTo)) return false;
		function typedOn(e: Entry, i: number) {
			if (e.author !== me || e.fate) return false;
			return (
				(e.to === h.aFrom && e.from < e.to && !wordsTyped('after', h.aFrom, i)) ||
				(e.from === h.aFrom && !!e.restore && sideOf(i) === 'after')
			);
		}
		if (mode === 'suggesting' && h.aFrom === h.aTo && entries.some(typedOn)) return false;
		const l = h.aFrom > wa0 ? beforeOwner[h.aFrom - 1 - wa0] : -1;
		const r = h.aTo < wa1 ? beforeOwner[h.aTo - wa0] : -1;
		if (l >= 0 && l === r && !acceptedGone && [...owners].every((w) => w === l)) return true;
		if (owners.size) return false;
		let runFrom = h.aFrom;
		let runTo = h.aTo;
		while (runFrom > 0 && /\s/.test(before[runFrom - 1])) runFrom--;
		while (runTo < before.length && /\s/.test(before[runTo])) runTo++;
		if (pending.some((s) => (s.from === s.to ? s.from >= runFrom && s.from <= runTo : s.from < runTo && s.to > runFrom))) return false;
		for (let b = h.bFrom - 1; b >= wb0 && /\s/.test(after[b]); b--) if (afterOwner[b - wb0] >= 0) return false;
		for (let b = h.bTo, a = h.aTo; b < after.length && /\s/.test(after[b]); b++, a++)
			if (a >= wa0 && a < wa1 && beforeOwner[a - wa0] >= 0) return false;
		const c = whitespaceChange(before, h, inserted)!;
		if (c.spaced) return true;
		function own(at: number) {
			return at < wa0 || at >= wa1 || beforeOwner[at - wa0] < 0;
		}
		return (own(c.at - 1) && /\s/.test(before[c.at - 1] ?? ' ')) || (own(c.at + c.cut) && /\s/.test(before[c.at + c.cut] ?? ' '));
	}

	const relations = new Map<number, ReturnType<typeof pointRelation>>();
	function relationOf(i: number) {
		if (!relations.has(i)) relations.set(i, pointRelation(entries[i].from));
		return relations.get(i)!;
	}

	function applyHunk(h: Hunk): void {
		const inserted = after.slice(h.bFrom, h.bTo);
		const owners = new Set<number>();
		let acceptedGone = false;
		for (let a = h.aFrom; a < h.aTo; a++) {
			const w = beforeOwner[a - wa0];
			if (w < 0) acceptedGone = true;
			else owners.add(w);
		}
		const points = entries.map((_, i) => i).filter((i) => isPoint(i) && !entries[i].fate);
		const inside = points.filter((i) => {
			const r = relationOf(i);
			return 'hunk' in r && r.hunk === h && r.side === 'inside';
		});
		function whole(i: number) {
			return !isPoint(i) && entries[i].from >= h.aFrom && entries[i].to <= h.aTo;
		}
		const typed = h.aFrom === h.aTo;
		// Words put back where they were taken from cancel that much of the deletion rather than
		// standing beside it as new ones. An undo lands here, and without this it reads as a deletion
		// of everything followed by an addition of the same thing, which is what the document already
		// said before either. Retyping by hand lands here too, and means the same thing.
		if (typed && inserted) {
			const back = points.find((i) => entries[i].author === me && entries[i].from === h.aFrom && entries[i].restore.startsWith(inserted));
			if (back !== undefined) {
				const e = entries[back];
				e.restore = e.restore.slice(inserted.length);
				// what is left of it stands after the words that came back, and so do the Deletes stacked after it
				e.point = h.bTo;
				for (const i of points) if (i > back && entries[i].from === h.aFrom) entries[i].point = h.bTo;
				if (!e.restore) e.fate = 'withdraw';
				return;
			}
			// a forward Delete adds to the end of what the spot took, so its undo gives back the end
			const tail = points.find((i) => entries[i].author === me && entries[i].from === h.aFrom && entries[i].restore.endsWith(inserted));
			if (tail !== undefined) {
				const e = entries[tail];
				e.restore = e.restore.slice(0, e.restore.length - inserted.length);
				e.point = h.bFrom;
				for (const i of points) if (i > tail && entries[i].from === h.aFrom) entries[i].point = h.bTo;
				if (!e.restore) e.fate = 'withdraw';
				return;
			}
		}
		if (typed) for (const i of points) if (entries[i].from === h.aFrom && sideOf(i) === 'before') entries[i].point = h.bTo;

		if (neutralHere(h, inserted, owners, acceptedGone)) {
			let owner = -1;
			if (owners.size === 1 && !acceptedGone) owner = [...owners][0];
			else {
				const l = h.aFrom > wa0 ? beforeOwner[h.aFrom - 1 - wa0] : -1;
				const r = h.aTo < wa1 ? beforeOwner[h.aTo - wa0] : -1;
				if (l === r) owner = l;
			}
			afterOwner.fill(owner, h.bFrom - wb0, h.bTo - wb0);
			for (const i of inside) entries[i].point = h.bFrom;
			return;
		}

		if (mode === 'editing') {
			// typing inside a suggestion, or over some of its words, is more of it; at its edges it is plain text
			const l = h.aFrom > wa0 ? beforeOwner[h.aFrom - 1 - wa0] : -1;
			const r = h.aTo < wa1 ? beforeOwner[h.aTo - wa0] : -1;
			const within =
				inserted !== '' &&
				!acceptedGone &&
				inside.length === 0 &&
				(owners.size === 1 ? !whole([...owners][0]) : typed && l >= 0 && l === r);
			if (within) {
				afterOwner.fill(owners.size === 1 ? [...owners][0] : l, h.bFrom - wb0, h.bTo - wb0);
				return;
			}
			for (const i of owners) {
				if (!whole(i)) continue;
				const e = entries[i];
				const exact = !acceptedGone && owners.size === 1 && inside.length === 0 && e.from === h.aFrom && e.to === h.aTo && !inserted;
				if (!exact) e.fate = 'close';
				else if (e.restore) e.point = h.bFrom;
				else e.fate = 'withdraw';
			}
			for (const i of inside) entries[i].fate = 'close';
			return;
		}

		function pointAt(at: number, skip: number) {
			return entries.some((x, j) => j !== skip && isPoint(j) && !x.fate && x.from === at);
		}
		let m = entries.findIndex((e, i) => {
			if (e.author !== me || e.fate) return false;
			if (typed && e.from === h.aFrom && e.restore && sideOf(i) === 'before') return false;
			if (isPoint(i)) {
				if (e.from < h.aFrom || e.from > h.aTo) return false;
				const edge = e.from === h.aFrom || h.aFrom === h.aTo ? (j: number) => j > i : (j: number) => j < i;
				return !entries.some((x, j) => edge(j) && isPoint(j) && !x.fate && x.author !== me && x.from === e.from);
			}
			if (e.to < h.aFrom || e.from > h.aTo) return false;
			if (typed && e.to === h.aFrom) return !wordsTyped('after', h.aFrom, i);
			if (typed && e.from === h.aFrom) return !wordsTyped('before', h.aFrom, i);
			return !(e.to === h.aFrom && pointAt(h.aFrom, i)) && !(e.from === h.aTo && pointAt(h.aTo, i));
		});
		if (m < 0) {
			entries.push({ id: o.newId(), restore: '', author: me, fresh: true, from: h.aFrom, to: h.aFrom });
			m = entries.length - 1;
		}
		const parts: { at: number; text: string; rank: number; n: number }[] = [];
		if (!entries[m].fresh) parts.push({ at: entries[m].from, text: entries[m].restore, rank: isPoint(m) ? 0 : 1, n: m });
		const stops = new Set(entries.flatMap((e, i) => (isPoint(i) && !e.fate && e.from > h.aFrom && e.from < h.aTo ? [e.from] : [])));
		for (let a = h.aFrom; a < h.aTo;) {
			if (beforeOwner[a - wa0] >= 0) {
				a++;
				continue;
			}
			const start = a;
			do a++;
			while (a < h.aTo && beforeOwner[a - wa0] < 0 && !stops.has(a));
			parts.push({ at: start, text: before.slice(start, a), rank: 2, n: 0 });
		}
		for (const i of owners) {
			if (i === m || !whole(i)) continue;
			const e = entries[i];
			const onlyTheirs = !inserted && !acceptedGone && owners.size === 1 && inside.length === 0 && e.from === h.aFrom && e.to === h.aTo;
			if (onlyTheirs && e.author !== me) {
				if (e.restore) e.point = h.bFrom;
				else e.fate = 'withdraw';
				continue;
			}
			parts.push({ at: e.from, text: e.restore, rank: 1, n: i });
			e.fate = e.author === me ? 'withdraw' : 'close';
		}
		for (const i of inside) {
			if (i === m) continue;
			parts.push({ at: entries[i].from, text: entries[i].restore, rank: 0, n: i });
			entries[i].fate = entries[i].author === me ? 'withdraw' : 'close';
		}
		entries[m].restore = parts
			.sort((x, y) => x.at - y.at || x.rank - y.rank || x.n - y.n)
			.map((p) => p.text)
			.join('');
		afterOwner.fill(m, h.bFrom - wb0, h.bTo - wb0);
		if (!inserted) entries[m].point = h.bFrom;
	}

	let ca = wa0;
	let d = 0;
	for (const h of hunks) {
		for (let a = ca; a < h.aFrom; a++) afterOwner[a + d - wb0] = beforeOwner[a - wa0];
		applyHunk(h);
		d += h.bTo - h.bFrom - (h.aTo - h.aFrom);
		ca = h.aTo;
	}
	for (let a = ca; a < wa1; a++) afterOwner[a + d - wb0] = beforeOwner[a - wa0];

	const runs = new Map<number, [number, number][]>();
	for (let j = 0; j < afterOwner.length;) {
		const w = afterOwner[j];
		const start = j;
		while (j < afterOwner.length && afterOwner[j] === w) j++;
		if (w >= 0) runs.set(w, [...(runs.get(w) ?? []), [wb0 + start, wb0 + j]]);
	}

	const rebuilt: (PlacedSuggestion & { fresh: boolean; was: number })[] = [];
	for (const [i, e] of entries.entries()) {
		if (e.fate) continue;
		const mine = runs.get(i);
		if (mine?.length) {
			mine.forEach(([from, to], n) => {
				if (n === 0) rebuilt.push({ id: e.id, from, to, restore: e.restore, author: e.author, fresh: e.fresh, was: e.from });
				else rebuilt.push({ id: o.newId(), from, to, restore: '', author: e.author, fresh: true, was: e.from });
			});
			continue;
		}
		let at = e.point;
		if (at === undefined) {
			const r = relationOf(i);
			at = 'moved' in r ? r.moved : r.side === 'right' ? r.hunk.bTo : r.hunk.bFrom;
		}
		if (!e.restore) {
			if (!e.fresh) e.fate = 'withdraw';
			continue;
		}
		rebuilt.push({ id: e.id, from: at, to: at, restore: e.restore, author: e.author, fresh: e.fresh, was: e.from });
	}

	const all = [...outside.map((s) => ({ ...s, fresh: false, was: s.from })), ...rebuilt].sort(
		(a, b) => a.from - b.from || a.to - b.to || a.was - b.was
	);
	const gone = new Map<string, 'close' | 'withdraw'>();
	for (const e of entries) if (e.fate && !e.fresh) gone.set(e.id, e.fate);

	const joined: typeof all = [];
	for (const s of all) {
		const prev = joined[joined.length - 1];
		if (prev && prev.author === s.author && prev.to === s.from && !(s.restore && prev.to > prev.from)) {
			const keep = prev.fresh && !s.fresh ? s : prev;
			const drop = keep === prev ? s : prev;
			if (!drop.fresh) gone.set(drop.id, 'withdraw');
			joined[joined.length - 1] = { ...keep, from: prev.from, to: s.to, restore: prev.restore + s.restore };
			continue;
		}
		joined.push(s);
	}

	const placed: PlacedSuggestion[] = [];
	const changes: SuggestionChange[] = [];
	const was = new Map(given.map((s) => [s.id, s]));
	const cancelled = cancelledRuns(after, joined);
	for (const [n, s] of joined.entries()) {
		if (cancelled.has(n) || sameWords(after, s, exact)) {
			if (!s.fresh) gone.set(s.id, 'withdraw');
			continue;
		}
		const { fresh, was: _was, ...rest } = s;
		placed.push(rest);
		const old = was.get(s.id);
		if (fresh || !old) changes.push({ t: 'open', id: s.id });
		else if (old.restore !== s.restore || before.slice(old.from, old.to) !== after.slice(s.from, s.to))
			changes.push({ t: 'revise', id: s.id });
	}
	for (const [id, t] of gone) if (!placed.some((s) => s.id === id)) changes.push({ t, id });
	return { placed, changes };
}
