// the numbers the editor shows; a count it is not sure of shows nothing, so a wrong number never shows
import type { Node as PMNode } from 'prosemirror-model';
import type { CompiledEntry } from '$lib/editor/visual/extensions/tableofcontents/compiled/compiledNumbers';
import { matchedNumbers } from '$lib/editor/visual/extensions/tableofcontents/compiled/compiledNumbers';
import { isSingleLabelEnvironment, numberedRowCount } from '$lib/editor/visual/extensions/mathlivebridge/mathEnvironments';
import type { CounterChange, NumberingScheme, WithinChange } from './numberingScheme';
import { ownStyleOf, parseForm, plainPrinted, readAnchor, renderForm, withOwnStyle, type NumberForm } from './numberForms';
import { printedValue } from './printedNumber';
import { eventsIn, type FootnoteMarks, type Item, type NumberEvent } from './numberEvents';
import { HEADINGS } from './numberedNodes';
import { eventsBefore, withReadIn, type NumberedFiles } from './readInEvents';
import { tagIn } from './tagText';
import { codeOnly } from '$lib/languages/latex/texCode';

/** repeated: labels written more than once, which anchor nothing */
export type NumberAnchors = {
	contents: readonly CompiledEntry[];
	labels: Readonly<Record<string, string>>;
	repeated?: readonly string[];
};

/** standalone: the file is the main file, so its count starts at the start; files: those the document reads in */
export type NumberingContext = {
	anchors: NumberAnchors;
	scheme: NumberingScheme;
	standalone: boolean;
	path?: string | null;
	files?: NumberedFiles | null;
};

/** each numbered node's numbers by its position: an equation's lines, a chip's footnotes, one for anything else */
export type DocumentNumbers = Map<number, string[]>;

const COUNTED = [...HEADINGS, 'equation', 'figure', 'table', 'footnote', 'mpfootnote'];
const NONUMBER = /\\(nonumber|notag)\b/;

function headingOf(node: PMNode): string {
	if (node.attrs.command === 'part' || node.attrs.command === 'chapter') return node.attrs.command;
	return HEADINGS[1 + Math.max(1, Math.min(5, Number(node.attrs.level ?? 1)))];
}

function captionOf(item: Item): string {
	if (item.kind === 'table') {
		let caption = '';
		item.node.forEach((child) => void (child.type.name === 'table_caption' && (caption = child.textContent)));
		return caption;
	}
	return item.node.textContent;
}

// a heading between two that match is taken as renamed only in the main file, whose headings are all the .aux's
function contentsAnchors(items: Item[], contents: readonly CompiledEntry[], renames: boolean): Map<Item, string> {
	const out = new Map<Item, string>();
	for (const kind of ['heading', 'figure', 'table'] as const) {
		const mine = items.filter((i) => i.kind === kind);
		// a heading the class prints with an empty number (revtex's prl) anchors one the editor cannot count
		const theirs = contents.filter((e) => e.kind === kind && (e.number || (kind === 'heading' && e.number !== null)));
		const titles = mine.map((i) => (kind === 'heading' ? String(i.node.attrs.shortTitle ?? '') || i.node.textContent : captionOf(i)));
		matchedNumbers(titles, theirs, renames).forEach((n, k) => n !== null && out.set(mine[k], n));
	}
	return out;
}

type Counter = { value: number; form: NumberForm | null; within: string | null; sure: boolean; printed: string | null };

// the standard classes: each heading restarts at the one above it, and a class with chapters prints them first
function defaultWithin(name: string, chapters: boolean): string | null {
	const i = HEADINGS.indexOf(name);
	if (i > 2) return HEADINGS[i - 1];
	if (i === 2) return chapters ? 'chapter' : null;
	return null;
}

class Count {
	readonly out: DocumentNumbers = new Map();
	private readonly counters: Record<string, Counter>;
	private sub: { base: string | null; letter: number } | null = null;
	private shown = true;
	private mainMatter = true;
	private minipages = 0;
	private depth: number | null;
	// footnotes the compile numbers its own way stay unsure through every restart
	private readonly compileCounted: readonly string[];

	constructor(
		private readonly fromContents: Map<Item, string>,
		private readonly context: NumberingContext,
		private readonly footnoteMarks: FootnoteMarks,
		private readonly chapters: boolean,
		starts: boolean
	) {
		const { scheme } = context;
		this.depth = scheme.secnumdepth;
		this.compileCounted = scheme.uncountedFootnotes ? ['footnote', 'mpfootnote'] : [];
		this.counters = Object.fromEntries(
			COUNTED.map((name) => {
				const form = parseForm(scheme.forms[name]);
				const within = scheme.within[name] ?? defaultWithin(name, chapters);
				const sure = starts && !(name === 'footnote' && scheme.uncountedFootnotes);
				return [name, { value: 0, form, within, sure, printed: null }];
			})
		);
	}

	run(events: NumberEvent[]): void {
		for (const event of events) {
			this.shown = !(event.type === 'item' && event.foreign);
			if (event.type === 'appendix') this.appendix();
			else if (event.type === 'matter') this.mainMatter = event.main;
			else if (event.type === 'change') this.change(event.change);
			else if (event.type === 'subequations') this.sub = event.open ? { base: this.next('equation'), letter: 0 } : null;
			else if (event.type === 'minipage') this.minipage(true);
			else if (event.type === 'minipage-end') this.minipage(false);
			else if (event.type === 'include') for (const c of Object.values(this.counters)) c.sure = false;
			else if (event.type === 'form') this.reform(event.counter, event.form);
			else if (event.type === 'within') this.rewithin(event.change);
			else if (event.type === 'hidden') this.counters[event.counter].sure = false;
			else this.number(event.item);
		}
	}

	private minipage(open: boolean): void {
		this.minipages += open ? 1 : -1;
		if (!open) return;
		this.counters.mpfootnote.value = 0;
		this.counters.mpfootnote.sure = !this.compileCounted.includes('mpfootnote');
	}

	private show(pos: number, numbers: string[]): void {
		if (this.shown) this.out.set(pos, numbers);
	}

	private labelAnchor(label: string | null): string | undefined {
		const { labels, repeated } = this.context.anchors;
		return label && !repeated?.includes(label) ? labels[label] : undefined;
	}

	// \the<counter> prints its value whether or not a heading showed it (revtex's prl numbers no sections)
	private printedOf = (name: string): string | null => {
		const c = this.counters[name];
		if (!c) return null;
		return c.printed ?? (c.sure && c.form ? renderForm(c.form, c.value, this.printedOf) : null);
	};

	private refs(): Record<string, string> {
		const out: Record<string, string> = {};
		for (const name of HEADINGS) {
			const printed = this.counters[name].printed;
			if (printed) out[name] = printed;
		}
		return out;
	}

	// a counter that steps restarts every counter within it; `headings`: only the headings, as \appendix leaves the rest
	private restart(parent: string, headings = false): void {
		const sure = this.counters[parent].sure;
		for (const [child, d] of Object.entries(this.counters)) {
			if (d.within !== parent || (headings && !HEADINGS.includes(child))) continue;
			d.value = 0;
			d.sure = sure && !this.compileCounted.includes(child);
			if (HEADINGS.includes(child)) d.printed = null;
			this.restart(child, headings);
		}
	}

	private render(name: string): string | null {
		const c = this.counters[name];
		return c.sure && c.form ? renderForm(c.form, c.value, this.printedOf) : null;
	}

	private next(name: string): string | null {
		this.counters[name].value++;
		const printed = this.render(name);
		this.restart(name);
		return printed;
	}

	// an anchor behind a count the editor is sure of is an .aux the document has grown past
	private settle(name: string, anchored: string | undefined, counted: string | null): string | null {
		if (anchored === undefined) return counted;
		const c = this.counters[name];
		const read = counted !== null ? readAnchor(plainPrinted(anchored), this.refs(), ownStyleOf(c.form)) : null;
		return read && read.value < c.value ? counted : this.anchor(name, anchored);
	}

	private anchor(name: string, printed: string): string {
		const c = this.counters[name];
		const text = plainPrinted(printed);
		const read = readAnchor(text, this.refs(), ownStyleOf(c.form));
		if (read) {
			c.value = read.value;
			c.form = read.form;
			// a class of the folder's own restarts it where it prints the heading's number (PoS's equations)
			const ref = read.form.find((p) => 'ref' in p);
			if (c.within === null && ref && 'ref' in ref && !HEADINGS.includes(name)) c.within = ref.ref;
		}
		// an anchor the editor cannot read shows as printed, and leaves the count after it to the next one
		c.sure = !!read;
		return text;
	}

	// the class's forms after \appendix where the data has them, else the top heading in letters
	private appendix(): void {
		const top = this.chapters ? 'chapter' : 'section';
		const c = this.counters[top];
		const after = this.context.scheme.appendixForms;
		for (const [name, form] of Object.entries(after)) {
			const d = this.counters[name];
			if (!d) continue;
			d.form = parseForm(form);
			// revtex's \appendix restarts the equations at each section its new form prints
			const ref = d.form?.find((p) => 'ref' in p);
			if (ref && 'ref' in ref && !HEADINGS.includes(name)) d.within = ref.ref;
		}
		if (!after[top] && c.form) c.form = withOwnStyle(c.form, 'Alph');
		c.value = 0;
		c.printed = null;
		this.restart(top, true);
	}

	private reform(counter: string, form: string | null): void {
		const c = this.counters[counter];
		if (!c) return;
		c.form = parseForm(form ?? undefined);
		if (!c.form) c.sure = false;
	}

	private rewithin({ counter, parent, form }: WithinChange): void {
		const c = this.counters[counter];
		if (!c) return;
		c.within = parent;
		if (form) c.form = parseForm(form);
	}

	private change({ counter, op, value }: CounterChange): void {
		if (counter === 'secnumdepth') {
			this.depth = value === null || (op === 'add' && this.depth === null) ? null : op === 'set' ? value : this.depth! + value;
			return;
		}
		const c = this.counters[counter];
		if (!c) return;
		if (value === null) c.sure = false;
		else if (op === 'set') {
			c.value = value;
			c.sure = !this.compileCounted.includes(counter);
		} else c.value += value;
	}

	private number(item: Item): void {
		if (item.kind === 'heading') return this.heading(item);
		if (item.kind === 'equation') {
			const numbers = this.equation(item);
			if (numbers.length) this.show(item.pos, numbers);
			return;
		}
		if (item.kind === 'footnote') {
			const marks = this.footnoteMarks(item.node.textContent);
			const numbers = marks.map((given) =>
				given === null ? (this.next(this.minipages > 0 ? 'mpfootnote' : 'footnote') ?? '') : String(given)
			);
			if (numbers.some(Boolean)) this.show(item.pos, numbers);
			return;
		}
		const label = item.node.attrs.label as string | null;
		const anchored = this.fromContents.get(item) ?? this.labelAnchor(label);
		this.counters[item.kind].value++;
		const n = this.settle(item.kind, anchored, this.render(item.kind));
		this.restart(item.kind);
		if (n) this.show(item.pos, [n]);
	}

	private heading(item: Item): void {
		const name = headingOf(item.node);
		const c = this.counters[name];
		if (name === 'chapter' && !this.mainMatter) return;
		const anchored = this.fromContents.get(item);
		// a level below secnumdepth steps nothing
		if (anchored === undefined && this.depth !== null && HEADINGS.indexOf(name) - 1 > this.depth) return;
		c.value++;
		const printed = this.settle(name, anchored, this.render(name));
		this.restart(name);
		c.printed = printed;
		if (printed) this.show(item.pos, [printed]);
	}

	private equation(item: Item): string[] {
		const c = this.counters.equation;
		// a \nonumber or a row break in a comment does nothing
		const text = codeOnly(item.node.textContent);
		const env = String(item.node.attrs.environment ?? '');
		const single = !env || isSingleLabelEnvironment(env);
		const tag = tagIn(text);
		// a single equation's \tag prints instead of a number and steps nothing
		if (single && tag) return tag.text === null ? [] : [tag.starred ? tag.text : `(${tag.text})`];
		if (single && NONUMBER.test(text)) return [];
		// a tag on one line of several is a count the editor does not follow
		if (tag) c.sure = false;
		const lines = single ? 1 : numberedRowCount(text);
		const labels = (item.node.attrs.lineLabels as string[] | null) ?? [];
		const numbers: string[] = [];
		for (let i = 0; i < lines; i++) {
			const label = (single ? item.node.attrs.label : labels[i]) as string | null;
			const anchored = this.labelAnchor(label);
			let n: string | null;
			if (this.sub) {
				this.sub.letter++;
				n = anchored ? plainPrinted(anchored) : this.sub.base ? `${this.sub.base}${printedValue(this.sub.letter, 'alph')}` : null;
			} else {
				c.value++;
				n = this.settle('equation', anchored, this.render('equation'));
				this.restart('equation');
			}
			if (n) numbers.push(`(${n})`);
		}
		return numbers;
	}
}

export function documentNumbers(doc: PMNode, footnoteMarks: FootnoteMarks, context: NumberingContext): DocumentNumbers {
	const own = eventsIn(doc, footnoteMarks, context.scheme.mathOpeners);
	const { files, path } = context;
	const before = files && path && !context.standalone ? eventsBefore(path, files) : null;
	const events = [...(before ?? []), ...(files && path ? withReadIn(own, path, files) : own)];
	const items = events.flatMap((e) => (e.type === 'item' ? [e.item] : []));
	const fromContents = contentsAnchors(items, context.anchors.contents, context.standalone);
	const chapters = context.scheme.chapters || items.some((i) => i.kind === 'heading' && i.node.attrs.command === 'chapter');
	const count = new Count(fromContents, context, footnoteMarks, chapters, context.standalone || before !== null);
	count.run(events);
	return count.out;
}
