// the numbers the open Typst document gives its headings, equations, figures and tables by its own count, for the
// time before a compile has printed them: on the elements, and in the references that name them
import type { Node } from 'prosemirror-model';
import type { SyntaxNode } from '@lezer/common';
import { namedArg, readTypstCall, typstSyntax, type TypstCall } from '../../core/reading/typstCall';
import { numberPrinted, numberReferenced, parseNumberPattern, type NumberPattern } from './numberPattern';

export type LabelNumber = { supplement: string; number: string } | null;

/** labels: null when the words a reference prints are out of the editor's reach. drawn: a heading's or an equation's number by its position */
export type OwnNumbers = { labels: Map<string, LabelNumber> | null; drawn: Map<number, string> };

type Family = 'figure' | 'table' | 'heading' | 'equation';

// words: a reference prints the English words Typst starts with
type Numbering = { patterns: Partial<Record<'figure' | 'heading' | 'equation', NumberPattern | null>>; words: boolean };

const SUPPLEMENTS: Record<Family, string> = { figure: 'Figure', table: 'Table', heading: 'Section', equation: 'Equation' };

const RULE_TARGETS: Record<string, 'figure' | 'heading' | 'equation'> = {
	figure: 'figure',
	heading: 'heading',
	'math.equation': 'equation'
};

function stringValue(call: TypstCall, name: string): string | null | undefined {
	const arg = namedArg(call, name);
	if (!arg) return undefined;
	return arg.kind === 'Str' ? arg.value.slice(1, -1) : arg.kind === 'None' ? null : undefined;
}

// null: the numbering itself is set where the editor cannot read it, in a template or by a function
function readNumbering(doc: Node): Numbering | null {
	const patterns: Numbering['patterns'] = { figure: parseNumberPattern('1') };
	let readable = true;
	let words = true;
	doc.forEach((node) => {
		if (node.type.name !== 'raw_latex') return;
		const text = node.textContent;
		if (/#show\s*:/.test(text)) readable = false;
		if (/#show\s*(ref\b|figure\b)/.test(text)) words = false;
		const call = readTypstCall(text.replace(/;\s*$/, ''));
		if (call?.form !== 'set') return;
		if (call.name === 'text') {
			const lang = stringValue(call, 'lang');
			if (namedArg(call, 'lang') && lang !== 'en') words = false;
			return;
		}
		const target = RULE_TARGETS[call.name];
		if (!target) return;
		if (namedArg(call, 'supplement')) words = false;
		const numbering = namedArg(call, 'numbering');
		if (!numbering) return;
		const pattern = stringValue(call, 'numbering');
		if (pattern === undefined) readable = false;
		else patterns[target] = pattern === null ? null : parseNumberPattern(pattern);
		if (pattern && !patterns[target]) readable = false;
	});
	return readable ? { patterns, words } : null;
}

type RawFacts = { families: Family[]; labels: string[] };
const rawFacts = new WeakMap<Node, RawFacts>();

function foreignIn(node: SyntaxNode, source: string, out: Set<Family>): void {
	if (node.name === 'SetRule') return;
	if (node.name === 'FuncCall' && node.firstChild) {
		const callee = source.slice(node.firstChild.from, node.firstChild.to);
		if (callee === 'figure') out.add('figure').add('table');
		else if (callee === 'heading') out.add('heading');
		else if (callee === 'math.equation') out.add('equation');
	}
	for (let c = node.firstChild; c; c = c.nextSibling) foreignIn(c, source, out);
}

function factsOf(node: Node): RawFacts {
	const known = rawFacts.get(node);
	if (known) return known;
	const text = node.textContent;
	const families = new Set<Family>();
	const labels: string[] = [];
	const top = typstSyntax(text);
	foreignIn(top, text, families);
	function collect(n: SyntaxNode): void {
		if (n.name === 'Label') labels.push(text.slice(n.from + 1, n.to - 1));
		for (let c = n.firstChild; c; c = c.nextSibling) collect(c);
	}
	collect(top);
	const facts = { families: [...families], labels };
	rawFacts.set(node, facts);
	return facts;
}

function ownNumbering(args: unknown): boolean {
	const items = (args as { items?: { role: string; text: string }[] } | null)?.items ?? [];
	return items.some((item) => item.role === 'arg' && /^(kind|supplement|numbering)\s*:/.test(item.text));
}

const counted = new WeakMap<Node, OwnNumbers | null>();

/** null when the document's numbering is out of the editor's reach */
export function ownNumbersOf(doc: Node): OwnNumbers | null {
	if (!counted.has(doc)) counted.set(doc, countOwnNumbers(doc));
	return counted.get(doc) ?? null;
}

function countOwnNumbers(doc: Node): OwnNumbers | null {
	const numbering = readNumbering(doc);
	if (!numbering) return null;
	const labels = new Map<string, LabelNumber>();
	const drawn = new Map<number, string>();
	const counters: Record<'figure' | 'table' | 'equation', number> = { figure: 0, table: 0, equation: 0 };
	let headings: number[] = [];
	const unsure = new Set<Family>();

	function name(label: unknown, family: Family, counts: number[], pattern: NumberPattern | null | undefined) {
		if (typeof label !== 'string' || !label) return;
		const known = pattern && !unsure.has(family) && counts.length > 0;
		labels.set(label, known ? { supplement: SUPPLEMENTS[family], number: numberReferenced(pattern, counts) } : null);
	}
	function draw(pos: number, family: Family, counts: number[], pattern: NumberPattern | null | undefined) {
		if (pattern && !unsure.has(family)) drawn.set(pos, numberPrinted(pattern, counts));
	}

	doc.descendants((node, pos) => {
		switch (node.type.name) {
			case 'heading': {
				if (node.attrs.numbered === false) break;
				if (ownNumbering(node.attrs.typCall)) unsure.add('heading');
				const level = Math.max(1, Number(node.attrs.level) || 1);
				const next = headings.slice(0, level);
				while (next.length < level) next.push(0);
				next[level - 1]++;
				headings = next;
				name(node.attrs.label, 'heading', headings.slice(0, level), numbering.patterns.heading);
				draw(pos, 'heading', headings.slice(0, level), numbering.patterns.heading);
				break;
			}
			case 'typ_figure':
				unsure.add('figure').add('table');
				if (node.attrs.label) labels.set(String(node.attrs.label), null);
				break;
			case 'image':
				if (ownNumbering(node.attrs.typFigure)) unsure.add('figure').add('table');
				if (node.attrs.numbered === true) {
					counters.figure++;
					name(node.attrs.label, 'figure', [counters.figure], numbering.patterns.figure);
				} else if (node.attrs.label) labels.set(String(node.attrs.label), null);
				break;
			case 'table_wrapper':
				if (ownNumbering(node.attrs.typFigure)) unsure.add('figure').add('table');
				counters.table++;
				name(node.attrs.label, 'table', [counters.table], numbering.patterns.figure);
				break;
			case 'block_math':
				if (numbering.patterns.equation) counters.equation++;
				name(node.attrs.label, 'equation', [counters.equation], numbering.patterns.equation);
				draw(pos, 'equation', [counters.equation], numbering.patterns.equation);
				break;
			case 'typ_env':
				if (node.attrs.label) labels.set(String(node.attrs.label), null);
				break;
			// what another file numbers is counted where the editor cannot see
			case 'includedoc':
				for (const family of Object.keys(SUPPLEMENTS) as Family[]) unsure.add(family);
				break;
			case 'raw_latex':
			case 'inline_latex':
				for (const family of factsOf(node).families) unsure.add(family);
				if (/#include\b/.test(node.textContent)) for (const family of Object.keys(SUPPLEMENTS) as Family[]) unsure.add(family);
				for (const label of factsOf(node).labels) if (!labels.has(label)) labels.set(label, null);
				return false;
		}
		return true;
	});
	return { labels: numbering.words ? labels : null, drawn };
}
