import { describe, it, expect } from 'vitest';
import type { Node, Mark } from 'prosemirror-model';
import * as LatexParser from '$lib/languages/latex/parser/latexParser';
import { schema } from '$lib/languages/latex/schema/latexPMSchema';
import { serializeToLatex, serializeNode } from '../../../../src/lib/languages/latex/serializer/latexSerializer';

const N = schema.nodes;
const tx = (text: string, ...marks: Mark[]): Node => schema.text(text, marks.length ? marks : undefined);
const mk = (name: string, attrs?: Record<string, unknown>): Mark => schema.marks[name].create(attrs);
const doc = (...content: Node[]): Node => N.doc.create(null, content);
const p = (...content: Node[]): Node => N.paragraph.create(null, content);

function parse(latex: string): Node {
	return LatexParser.latexToProseMirror(latex, {}).doc;
}

/** structural signature: type + content + meaningful attrs, whitespace-normalized */
function sig(n: Node): unknown {
	if (n.isText) {
		const text = (n.text ?? '').replace(/\s+/g, ' ').trim();
		if (!text) return null;
		const marks = n.marks.map((m) => m.type.name).sort();
		return { text, marks };
	}
	// math content is raw passthrough; unified-latex is not idempotent on math whitespace
	if (n.type.name === 'block_math' || n.type.name === 'inline_math') {
		const math = n.textContent.replace(/\s+/g, '');
		return n.type.name === 'block_math'
			? { type: n.type.name, math, attrs: { numbered: Boolean(n.attrs.numbered), environment: n.attrs.environment ?? null } }
			: { type: n.type.name, math };
	}
	const content: unknown[] = [];
	n.forEach((c) => {
		const s = sig(c);
		if (s !== null) content.push(s);
	});
	if (n.type.name === 'paragraph' && content.length === 0) return null;
	const out: Record<string, unknown> = { type: n.type.name };
	if (content.length) out.content = content;
	if (n.type.name === 'heading') out.attrs = { level: n.attrs.level, numbered: n.attrs.numbered };
	if (n.type.name === 'list') out.attrs = { kind: n.attrs.kind };
	return out;
}

function roundTrips(latex: string): void {
	const a = parse(latex);
	const b = parse(serializeToLatex(a));
	expect(sig(b)).toEqual(sig(a));
}

describe('headings — deterministic level → command', () => {
	it('numbered subsubsection', () => {
		expect(serializeToLatex(doc(N.heading.create({ level: 3, numbered: true }, tx('Intro'))))).toBe('\\subsubsection{Intro}');
	});
	it('unnumbered subsection → starred', () => {
		expect(serializeToLatex(doc(N.heading.create({ level: 2, numbered: false }, tx('Methods'))))).toBe('\\subsection*{Methods}');
	});
	it('section for level 1', () => {
		expect(serializeToLatex(doc(N.heading.create({ level: 1, numbered: true }, tx('Top'))))).toBe('\\section{Top}');
	});
});

describe('marks', () => {
	it('bold + italic', () => {
		expect(serializeToLatex(doc(p(tx('Hello '), tx('world', mk('strong')), tx(' and '), tx('italics', mk('em')), tx('.'))))).toBe(
			'Hello \\textbf{world} and \\textit{italics}. \\par'
		);
	});
	it('marks nest in schema order (em inner, strong outer)', () => {
		// schema normalizes mark order, so strong+em always serializes the same way
		expect(serializeToLatex(doc(p(tx('x', mk('strong'), mk('em')))))).toContain('\\textbf{\\textit{x}}');
	});
	it('link href is NOT escaped', () => {
		const out = serializeToLatex(doc(p(tx('site', mk('link', { href: 'http://x.com?a=1&b=2' })))));
		expect(out).toContain('\\href{http://x.com?a=1&b=2}{site}');
	});
	it('textcolor escapes its color value but emits the command', () => {
		expect(serializeToLatex(doc(p(tx('R', mk('textcolor', { color: 'red' })))))).toContain('\\textcolor{red}{R}');
	});
});

describe('escaping — text mode', () => {
	it('escapes & _ % $ # but leaves prose intact', () => {
		expect(serializeToLatex(doc(p(tx('a & b_c % d $e# f'))))).toContain('a \\& b\\_c \\% d \\$e\\# f');
	});
});

describe('math', () => {
	it('inline math passes through unescaped (via schema leafText)', () => {
		expect(serializeToLatex(doc(p(tx('x is '), N.inline_math.create(null, tx('\\alpha_1')), tx('.'))))).toContain('$\\alpha_1$');
	});
	it('block math → display', () => {
		expect(serializeToLatex(doc(N.block_math.create({ numbered: false }, tx('E = mc^2'))))).toBe('\\[\nE = mc^2\n\\]');
	});
	it('numbered + labelled → equation', () => {
		expect(serializeToLatex(doc(N.block_math.create({ numbered: true, label: 'eq:e' }, tx('E=mc^2'))))).toBe(
			'\\begin{equation}\\label{eq:e}\nE=mc^2\n\\end{equation}'
		);
	});
	it('align environment (unnumbered → starred)', () => {
		const out = serializeToLatex(
			doc(N.block_math.create({ environment: 'align', numbered: false, lineLabels: [] }, tx('a &= b \\\\ c &= d')))
		);
		expect(out).toContain('\\begin{align*}');
		expect(out).toContain('a &= b \\\\');
	});
	// regression guard: a redundant-but-valid trailing `\\` on the last row produced an extra
	// empty split segment that rejoined into a genuine blank line inside math mode, illegal there
	// ("Paragraph ended before \align* was complete"; corpus repros: 1706.03762, 1612.08242,
	// 1804.02767)
	it('a trailing \\\\ on the last row does not leave a blank line before \\end{align*}', () => {
		const out = serializeToLatex(
			doc(N.block_math.create({ environment: 'align', numbered: false, lineLabels: [] }, tx('a &= b \\\\ c &= d \\\\')))
		);
		expect(out).not.toMatch(/\\\\\s*\n\s*\n\s*\\end\{align\*\}/);
		expect(out).toBe('\\begin{align*}\na &= b \\\\\nc &= d\n\\end{align*}');
	});
});

describe('list (flat-list model)', () => {
	it('two bullet items coalesce into one itemize', () => {
		const out = serializeToLatex(doc(N.list.create({ kind: 'bullet' }, p(tx('one'))), N.list.create({ kind: 'bullet' }, p(tx('two')))));
		expect(out).toContain('\\begin{itemize}');
		expect(out).toContain('\\end{itemize}');
		expect((out.match(/\\item/g) ?? []).length).toBe(2);
		expect((out.match(/\\begin\{itemize\}/g) ?? []).length).toBe(1); // coalesced
		expect(out).toContain('one');
		expect(out).toContain('two');
	});
});

describe('table', () => {
	const cell = (txt: string, attrs?: Record<string, unknown>): Node => N.table_cell.create(attrs ?? null, p(tx(txt)));
	const row = (...cells: Node[]): Node => N.table_row.create(null, cells);

	it('2×2 bordered tabularx with & separators and \\hline rows', () => {
		const out = serializeToLatex(
			doc(
				N.table_wrapper.create({ label: null, showNotes: false, spanning: false }, [
					N.table_caption.create(null, tx('My table')),
					N.table.create(null, [row(cell('a'), cell('b')), row(cell('c'), cell('d'))])
				])
			)
		);
		expect(out).toContain('\\begin{tabularx}{0.8\\textwidth}{|X|X|}');
		expect(out).toContain('\\caption{My table}');
		expect(out).toContain('a &b');
		expect(out).toContain('\\hline');
		expect(out).toContain('\\end{table}');
	});

	it('rowspan → \\multirow', () => {
		const out = serializeToLatex(doc(N.table.create(null, [row(cell('merged', { rowspan: 2 }), cell('x')), row(cell('y'))])));
		expect(out).toContain('\\multirow{2}{*}{merged}');
	});
});

describe('citation / ref / image', () => {
	it('citation — basic', () => {
		expect(serializeToLatex(doc(p(N.citation.create({ variant: 'autocite' }, tx('smith2020')))))).toContain('\\autocite{smith2020}');
	});
	it('citation — with pre/post notes', () => {
		expect(serializeToLatex(doc(p(N.citation.create({ variant: 'cite', prenote: 'see', postnote: 'p. 5' }, tx('smith2020')))))).toContain(
			'\\cite[see][p. 5]{smith2020}'
		);
	});
	// a node with no command carries the schema default, and that has to be a command the parser
	// reads back - \autoref is no longer one of those, and needs hyperref besides
	it('ref → ref', () => {
		expect(serializeToLatex(doc(p(N.ref.create({ refType: 'figure' }, tx('fig:1')))))).toContain('\\ref{fig:1}');
	});
	it('image → figure with includegraphics + label', () => {
		// serialize the image node directly (sidesteps inline/block doc placement)
		const img = N.image.create({ src: 'images/a.png', label: 'fig:a', numbered: true, showCaption: true });
		const out = serializeNode(img, { parent: null, index: 0, isLastChild: true, inTableCell: false });
		expect(out).toContain('\\begin{figure}[h]');
		expect(out).toContain('\\includegraphics[width=0.5\\textwidth]{images/a.png}');
		expect(out).toContain('\\label{fig:a}');
	});
});

describe('round-trip stability', () => {
	it('heading', () => roundTrips('\\subsubsection{Intro}'));
	it('starred heading', () => roundTrips('\\subsection*{Methods}'));
	it('paragraph with marks', () => roundTrips('Hello \\textbf{world} and \\textit{italics}.'));
	it('display math', () => roundTrips('\\[\nx^2 = y\n\\]'));
	it('numbered equation', () => roundTrips('\\begin{equation}\\label{eq:1}\nE=mc^2\n\\end{equation}'));
	it('itemize', () => roundTrips('\\begin{itemize}\n\\item one\n\\item two\n\\end{itemize}'));
	it('citation', () => roundTrips('See \\autocite{smith2020} for details.'));
	it('ref', () => roundTrips('As in \\autoref{fig:1}.'));
	it('superscript', () => roundTrips('E = mc\\textsuperscript{2}.'));
	it('subscript', () => roundTrips('H\\textsubscript{2}O.'));
});

describe('abstract — round-trip', () => {
	it('environment form parses and round-trips', () => {
		const src = '\\begin{abstract}\nThis is the abstract.\n\\end{abstract}';
		const a = parse(src);
		let hasAbstract = false;
		a.descendants((n) => {
			if (n.type.name === 'abstract') hasAbstract = true;
		});
		expect(hasAbstract).toBe(true);
		// round-trips back to the env form (sourceForm defaults to 'env')
		const out = serializeToLatex(a);
		expect(out).toContain('\\begin{abstract}');
		expect(out).toContain('\\end{abstract}');
		expect(out).toContain('This is the abstract.');
	});

	it('command form (\\abstract{...}) parses to an abstract node and round-trips as the same shape', () => {
		const src = '\\abstract{This is the abstract inline.}';
		const a = parse(src);
		let sourceForm: string | null = null;
		a.descendants((n) => {
			if (n.type.name === 'abstract') sourceForm = n.attrs.sourceForm;
		});
		expect(sourceForm).toBe('macro');
		const out = serializeToLatex(a);
		// round-trips back to the command form when the abstract holds exactly one paragraph
		expect(out).toContain('\\abstract{');
		expect(out).toContain('This is the abstract inline.');
		expect(out).not.toContain('\\begin{abstract}');
	});

	it('multi-paragraph macro-form abstract promotes to environment form (nothing lost)', () => {
		const doc0 = doc(N.abstract.create({ sourceForm: 'macro' }, [p(tx('Para 1')), p(tx('Para 2'))]));
		const out = serializeToLatex(doc0);
		// multi-paragraph doesn't fit `\abstract{...}` args, so the serializer normalizes to env form
		expect(out).toContain('\\begin{abstract}');
		expect(out).toContain('Para 1');
		expect(out).toContain('Para 2');
	});
});

describe('sup/sub — deterministic serialization', () => {
	it('superscript wraps in \\textsuperscript', () => {
		expect(serializeToLatex(doc(p(tx('E = mc'), tx('2', mk('sup')))))).toContain('\\textsuperscript{2}');
	});
	it('subscript wraps in \\textsubscript', () => {
		expect(serializeToLatex(doc(p(tx('H'), tx('2', mk('sub')), tx('O'))))).toContain('\\textsubscript{2}');
	});
});
