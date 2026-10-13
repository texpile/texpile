// the numbers the last compile printed, put on the Contents entries they belong to: a heading, figure or table matches
// the next compiled one of its kind with the same title, or the one it was renamed from. One added since has no number
import type { TocItem } from '../tocStore';

export type CompiledEntry = { kind: 'heading' | 'figure' | 'table'; title: string; number: string | null };

type Kind = CompiledEntry['kind'];

// past this many cells the table is skipped, and a changed middle is numbered only when nothing was added or removed
const MOST_CELLS = 1_000_000;

/** letters and digits only: what TeX writes of a title keeps its words, not its markup or spacing */
function plainTitle(title: string): string {
	return title
		.replace(/\\[a-zA-Z@]+/g, ' ')
		.replace(/[^\p{L}\p{N}]+/gu, '')
		.toLowerCase();
}

/** for each item, the index of the compiled entry it is, or -1: the most titles that match in order, and between two of
 *  those as many items as entries, which are headings renamed since */
function matchKind(items: string[], entries: string[]): number[] {
	const out = items.map(() => -1);
	let head = 0;
	while (head < items.length && head < entries.length && items[head] === entries[head]) out[head] = head++;
	let tail = 0;
	while (
		tail < items.length - head &&
		tail < entries.length - head &&
		items[items.length - 1 - tail] === entries[entries.length - 1 - tail]
	) {
		out[items.length - 1 - tail] = entries.length - 1 - tail;
		tail++;
	}
	const a = items.slice(head, items.length - tail);
	const b = entries.slice(head, entries.length - tail);
	let gapA = 0;
	let gapB = 0;
	function closeGap(i: number, j: number): void {
		if (i - gapA === j - gapB) for (let k = 0; k < i - gapA; k++) out[head + gapA + k] = head + gapB + k;
	}
	if ((a.length + 1) * (b.length + 1) <= MOST_CELLS) {
		const w = b.length + 1;
		const common = new Uint32Array((a.length + 1) * w);
		for (let i = a.length - 1; i >= 0; i--)
			for (let j = b.length - 1; j >= 0; j--)
				common[i * w + j] = a[i] === b[j] ? common[(i + 1) * w + j + 1] + 1 : Math.max(common[(i + 1) * w + j], common[i * w + j + 1]);
		let i = 0;
		let j = 0;
		while (i < a.length && j < b.length) {
			if (a[i] === b[j]) {
				closeGap(i, j);
				out[head + i] = head + j;
				gapA = ++i;
				gapB = ++j;
			} else if (common[(i + 1) * w + j] >= common[i * w + j + 1]) i++;
			else j++;
		}
	}
	closeGap(a.length, b.length);
	return out;
}

/** `short` is the title in [ ], which is the one the .aux holds */
export function withCompiledNumbers(items: (TocItem & { short?: string })[], compiled: CompiledEntry[]): TocItem[] {
	const kinds: Kind[] = ['heading', 'figure', 'table'];
	const number = new Map<number, string | null>();
	for (const kind of kinds) {
		const mine = items.flatMap((item, i) => ((item.kind ?? 'heading') === kind ? [i] : []));
		const theirs = compiled.filter((e) => e.kind === kind);
		const found = matchKind(
			mine.map((i) => plainTitle(items[i].short ?? items[i].text)),
			theirs.map((e) => plainTitle(e.title))
		);
		found.forEach((k, j) => k >= 0 && number.set(mine[j], theirs[k].number));
	}
	return items.map(({ short: _short, ...item }, i) => {
		const n = number.get(i);
		return n ? { ...item, number: n } : item;
	});
}
