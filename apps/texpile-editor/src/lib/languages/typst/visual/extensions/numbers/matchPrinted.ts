// which printed number belongs to which element of the open file. Typst prints the numbers of the whole document and
// the editor holds one file of it, so an element takes a number only when the match is certain
import { matchedNumbers, plainTitle } from '$lib/editor/visual/extensions/tableofcontents/compiled/compiledNumbers';
import type { TypstPrintedNumber } from '$lib/stores/typstPrintedNumbers';

export type NumberedElement = {
	/** 'include': the place another file is read in, which prints nothing itself */
	kind: TypstPrintedNumber['kind'] | 'include';
	label: string | null;
	/** a heading's title or a figure's caption */
	text: string;
	level?: number;
	/** null when the document does not say which kind the figure is */
	figureKind?: string | null;
};

const KINDS: TypstPrintedNumber['kind'][] = ['heading', 'equation', 'figure', 'footnote'];

type Anchor = { element: number; printed: number };

function compatible(element: NumberedElement, item: TypstPrintedNumber): boolean {
	if (element.kind === 'heading') return element.level === undefined || item.level === undefined || element.level === item.level;
	if (element.kind === 'figure')
		return element.figureKind == null || item.figureKind === undefined || element.figureKind === item.figureKind;
	return true;
}

// for each title the index of the entry it is, or -1. A file that is the whole document pairs by order; a part of it
// pairs only the titles written once on each side, because the same title can stand in another file
function pairTitles(titles: string[], entries: string[], inOrder: boolean): number[] {
	if (inOrder) {
		const found = matchedNumbers(
			titles,
			entries.map((title, i) => ({ kind: '', title, number: String(i) })),
			false
		);
		return found.map((n) => (n === null ? -1 : Number(n)));
	}
	function indexOf(keys: string[]): Map<string, number[]> {
		const out = new Map<string, number[]>();
		keys.forEach((key, i) => out.set(key, [...(out.get(key) ?? []), i]));
		return out;
	}
	const mine = indexOf(titles.map(plainTitle));
	const theirs = indexOf(entries.map(plainTitle));
	return titles.map((title) => {
		const key = plainTitle(title);
		const [at, ...more] = mine.get(key) ?? [];
		const [found, ...others] = theirs.get(key) ?? [];
		return at !== undefined && !more.length && found !== undefined && !others.length ? found : -1;
	});
}

// the most anchors whose printed positions rise, so a block moved since the compile does not set the neighbors
function risingAnchors(anchors: Anchor[]): Anchor[] {
	const tails: number[] = [];
	const before: number[] = [];
	anchors.forEach((a, i) => {
		let lo = 0;
		let hi = tails.length;
		while (lo < hi) {
			const mid = (lo + hi) >> 1;
			if (anchors[tails[mid]].printed < a.printed) lo = mid + 1;
			else hi = mid;
		}
		before[i] = lo ? tails[lo - 1] : -1;
		tails[lo] = i;
	});
	const out: Anchor[] = [];
	for (let i = tails.length ? tails[tails.length - 1] : -1; i >= 0; i = before[i]) out.unshift(anchors[i]);
	return out;
}

class Matching {
	private readonly given: number[];
	private readonly settled: boolean[];
	private readonly taken: boolean[];

	constructor(
		private readonly elements: readonly NumberedElement[],
		private readonly printed: readonly TypstPrintedNumber[],
		private readonly whole: boolean
	) {
		this.given = elements.map(() => -1);
		this.settled = elements.map(() => false);
		this.taken = printed.map(() => false);
	}

	run(): (TypstPrintedNumber | null)[] {
		this.byLabel();
		this.byTitle();
		this.byOrder();
		return this.given.map((p) => (p < 0 ? null : this.printed[p]));
	}

	private give(element: number, printed: number): void {
		this.given[element] = printed;
		this.taken[printed] = true;
	}

	private free(element: number): boolean {
		return this.given[element] < 0 && !this.settled[element];
	}

	// a label is one element's. Written on two, or found on another kind of element, it is a change since the compile
	private byLabel(): void {
		const printedAt = new Map<string, number[]>();
		this.printed.forEach((item, i) => item.label && printedAt.set(item.label, [...(printedAt.get(item.label) ?? []), i]));
		const elementsAt = new Map<string, number[]>();
		this.elements.forEach((e, i) => e.label && elementsAt.set(e.label, [...(elementsAt.get(e.label) ?? []), i]));
		for (const [label, els] of elementsAt) {
			const ps = printedAt.get(label);
			if (!ps) continue;
			for (const p of ps) this.taken[p] = true;
			if (ps.length === 1 && els.length === 1 && this.printed[ps[0]].kind === this.elements[els[0]].kind) this.give(els[0], ps[0]);
			else for (const e of els) this.settled[e] = true;
		}
	}

	private pairGroup(elements: number[], printed: number[]): void {
		const found = pairTitles(
			elements.map((i) => this.elements[i].text),
			printed.map((p) => this.printed[p].text),
			this.whole
		);
		found.forEach(
			(k, j) => k >= 0 && compatible(this.elements[elements[j]], this.printed[printed[k]]) && this.give(elements[j], printed[k])
		);
	}

	private indices<T>(items: readonly T[], keep: (item: T, i: number) => boolean): number[] {
		return items.flatMap((item, i) => (keep(item, i) ? [i] : []));
	}

	// headings by title, figures by title within their kind
	private byTitle(): void {
		const titled = (i: number) => plainTitle(this.elements[i].text) !== '';
		const free = (kind: string) => this.indices(this.elements, (e, i) => e.kind === kind && this.free(i) && titled(i));
		const open = (kind: string) => this.indices(this.printed, (p, i) => p.kind === kind && !this.taken[i] && plainTitle(p.text) !== '');
		this.pairGroup(free('heading'), open('heading'));
		const figures = free('figure');
		for (const figureKind of new Set(figures.map((i) => this.elements[i].figureKind).filter((k): k is string => typeof k === 'string')))
			this.pairGroup(
				figures.filter((i) => this.elements[i].figureKind === figureKind),
				open('figure').filter((p) => this.printed[p].figureKind === figureKind)
			);
	}

	// elements still without a number take the printed ones between the same two matched neighbors, when both hold the same count
	private byOrder(): void {
		const matched: Anchor[] = [];
		this.given.forEach((printed, element) => printed >= 0 && matched.push({ element, printed }));
		const bounds = [
			{ element: -1, printed: -1 },
			...risingAnchors(matched),
			{ element: this.elements.length, printed: this.printed.length }
		];
		for (let i = 0; i + 1 < bounds.length; i++) {
			const [from, to] = [bounds[i], bounds[i + 1]];
			// a file's own edge is a neighbor only when the file is all of the document
			const fromKnown = i > 0 || this.whole;
			const toKnown = i + 2 < bounds.length || this.whole;
			const includes = this.indices(this.elements, (e, k) => k > from.element && k < to.element && e.kind === 'include');
			for (const kind of KINDS) {
				if (!includes.length && fromKnown && toKnown) this.fillBetween(from, to, kind);
				else
					this.fillBeside(
						{ from, to, kind },
						fromKnown ? (includes[0] ?? to.element) : from.element,
						toKnown ? (includes[includes.length - 1] ?? from.element) : to.element
					);
			}
		}
	}

	private fillBetween(from: Anchor, to: Anchor, kind: TypstPrintedNumber['kind']): void {
		const elements = this.indices(this.elements, (e, i) => i > from.element && i < to.element && e.kind === kind && this.free(i));
		const printed = this.indices(this.printed, (p, i) => i > from.printed && i < to.printed && p.kind === kind && !this.taken[i]);
		if (elements.length !== printed.length) return;
		if (elements.every((e, k) => compatible(this.elements[e], this.printed[printed[k]])))
			elements.forEach((e, k) => this.give(e, printed[k]));
	}

	// a stretch that goes on into another file: the elements up to `headEnd` take the printed ones right after the first
	// neighbor, those after `tailStart` the ones right before the second. What lies between is the other file's
	private fillBeside(stretch: { from: Anchor; to: Anchor; kind: TypstPrintedNumber['kind'] }, headEnd: number, tailStart: number): void {
		const { from, to, kind } = stretch;
		const inside = this.indices(this.elements, (e, i) => i > from.element && i < to.element && e.kind === kind);
		const printed = this.indices(this.printed, (p, i) => i > from.printed && i < to.printed && p.kind === kind);
		if (!inside.every((e) => this.free(e)) || printed.some((p) => this.taken[p])) return;
		const head = inside.filter((e) => e < headEnd);
		const tail = inside.filter((e) => e > tailStart && e >= headEnd);
		if (head.length + tail.length > printed.length) return;
		const pairs = [...head.map((e, k) => [e, printed[k]]), ...tail.map((e, k) => [e, printed[printed.length - tail.length + k]])];
		if (pairs.every(([e, p]) => compatible(this.elements[e], this.printed[p]))) pairs.forEach(([e, p]) => this.give(e, p));
	}
}

/** for each element what Typst printed for it; null when the editor cannot tell which printed one is its.
 *  `whole`: the file is the document's main file and brings in no other, so the printed list is its own */
export function matchPrinted(
	elements: readonly NumberedElement[],
	printed: readonly TypstPrintedNumber[],
	whole: boolean
): (TypstPrintedNumber | null)[] {
	return new Matching(elements, printed, whole).run();
}
