// The Typst visual round trip: source -> ProseMirror -> source. Two properties carry the whole
// design, same as the LaTeX and Markdown siblings: a no-edit save is BYTE-identical (verbatim
// verbatim substitution), and regeneration (what an edited block goes through) reaches a fixed
// point instead of drifting on every save.
import { describe, it, expect } from 'vitest';
import { EditorState } from '@codemirror/state';
import { parseTypstFile, serializeTypstFile } from '$lib/languages/typst/visual/roundtrip';
import { serializeToTypst, escTypst } from '$lib/languages/typst/visual/serialize/serializer';
import { typstToProseMirror } from '$lib/languages/typst/visual/convert/converter';
import { typSchema } from '$lib/languages/typst/visual/schema';
import { computeTableSkeleton } from '$lib/languages/typst/source/sourceInsert';
import { typTableNode } from '$lib/languages/typst/visual/blockInsertItems';
import { sliceToTypst } from '$lib/languages/typst/visual/clipboard';
import { Slice, type Node } from 'prosemirror-model';
import { EditorState as EditorState_pm } from 'prosemirror-state';
import { CellSelection, mergeCells } from 'prosemirror-tables';

/** the no-edit save: parse then serialize, nothing touched. */
function roundtrip(src: string): string {
	const parsed = parseTypstFile(src);
	return serializeTypstFile(parsed, parsed.doc);
}

export const CORPUS: Record<string, string> = {
	basic: '= Title\n\nA paragraph with _em_, *strong*, `code`, and #link("https://x.example")[a link].\n',
	headings: '= Title\n\nSome *bold* and _emph_ text.\n\n== Sub\n\n=== Deeper\n\nMore.\n',
	lists: '- one\n- two\n  - nested\n- three\n\n+ first\n+ second\n\n/ term: definition\n',
	wideList: '- one\n\n- two\n',
	enumStart: '3. third\n4. fourth\n',
	oddSpacing: '=  Heading with spaces\n\n\nText after two blanks.\n\n\n\nMore.\n',
	fenced: 'Before\n\n```python\ndef f():\n    return 1\n```\n\nAfter\n',
	mathy: 'Inline $x^2$ and display:\n\n$ integral_0^1 f(x) dif x $\n',
	codemode: '#import "lib.typ": report\n#show: report.with(title: [Hi])\n#let x = 4\n\n#figure(image("a.png"), caption: [A caption])\n',
	inlineCalls: 'Para with #emph[call] and #lorem(3) inside.\n\n#lorem(20)\n',
	breaksQuotes: 'Line one \\\nline two continues.\n\nSmart "quotes" and -- dashes --- here.\n',
	escapes: 'A \\* literal star and \\# hash and snake_case_word, 5 \\* 3.\n',
	comments: '// line comment\nText after. /* block */ more.\n',
	refsLabels: 'See @intro and <mylabel> markers.\n',
	unicode: 'Emoji \u{1f600} in *bold 中文* text.\n',
	hardWrap: 'This paragraph is wrapped\nacross several lines\nin the source.\n',
	noTrailingNewline: '= No trailing newline',
	empty: '',
	whitespaceOnly: '\r\n',
	figureTable:
		'#figure(\n  table(\n    columns: 2,\n    table.header([K], [V]),\n    [a], [1],\n  ),\n  caption: [Results by key.],\n) <tab:res>\n\n#figure(table(columns: 2, [x], [y], gutter: 4pt), caption: [fancy]) <t2>\n',
	terms: '/ alpha: the first letter\n/ beta: the second, with *bold*\n\n/ lone: a separate run\n',
	markCalls:
		'Some #underline[under] and #super[sup]#sub[sub] text with #highlight[glow], #highlight(fill: lime)[loud] and #text(fill: red)[warm] words.\n\n#underline[a fully marked paragraph]\n\n#text(fill: rgb("#00ffff"))[cool] but #text(fill: eastern)[unshared] and #underline(stroke: red)[fancy] stay raw.\n',
	tables:
		'#table(\n  columns: 3,\n  table.header([A], [B], [C]),\n  [a], [b *bold*], [c],\n  [d], [e], [f],\n)\n\n#table(columns: (auto, 1fr), align: (left, right), [x], [y])\n\n#table(\n  columns: 2,\n  stroke: none,\n  [kept], [raw],\n)\n',
	quotes2: '#quote(block: true)[\n  Two roads diverged in a wood.\n]\n\n#quote[inline stays raw]\n',
	hr: 'above\n\n#line(length: 100%)\n\nbelow\n\n#line(length: 50%)\n',
	// the #set line is not decoration: typst refuses to reference an equation that is not numbered,
	// so without it this fixture is source no compiler would accept
	eqLabels: '#set math.equation(numbering: "(1)")\n\n$ E = m c^2 $ <eq:mass>\n\nSee @eq:mass.\n\n$ #calc.pow(2, 3) $ <eq:id>\n',
	figures:
		'#figure(image("plots/a.png"), caption: [A *bold* caption]) <fig:a>\n\n#figure(image("b.png", width: 70%))\n\n#image("c.svg")\n\n#figure(rect(), caption: [not an image])\n',
	realWorld:
		'#import "lib/template.typ": report\n#show: report.with(\n  title: [A Report],\n  authors: ("A. Author",),\n)\n\n= Introduction\n\nTypst reached #link("https://typst.app")[version 0.15] recently @typst2023.\n\n#include "content/methods.typ"\n\n#bibliography("refs.bib")\n'
};

describe('typst no-edit save is byte-identical', () => {
	for (const [name, src] of Object.entries(CORPUS)) {
		it(name, () => {
			expect(roundtrip(src)).toBe(src);
		});
	}
});

describe('regeneration reaches a fixed point', () => {
	// the converter's docs carry no norm data here (fillOrigNorms not run), so every block
	// regenerates: serialize, re-parse, re-serialize; the second pass must not drift
	for (const [name, src] of Object.entries(CORPUS)) {
		it(name, () => {
			const gen1 = serializeToTypst(typstToProseMirror(src).doc);
			const gen2 = serializeToTypst(typstToProseMirror(gen1).doc);
			expect(gen2).toBe(gen1);
		});
	}
});

describe('an edit regenerates only its block', () => {
	it('editing the middle paragraph leaves neighbours byte-identical', () => {
		const src = '= Title\n\nfirst   paragraph\n\nsecond   paragraph\n\nthird   paragraph\n';
		const parsed = parseTypstFile(src);
		const doc = parsed.doc;
		const target = doc.child(2);
		expect(target.textContent).toContain('second');
		const replaced = target.type.create({ ...target.attrs }, typSchema.text('EDITED'), target.marks);
		const kids = [];
		for (let i = 0; i < doc.childCount; i++) kids.push(i === 2 ? replaced : doc.child(i));
		const edited = doc.copy(typSchema.nodes.doc.create(null, kids).content);
		const out = serializeTypstFile(parsed, edited);
		expect(out).toContain('first   paragraph'); // verbatim neighbours keep odd spacing
		expect(out).toContain('third   paragraph');
		expect(out).toContain('EDITED');
		expect(out).not.toContain('second');
	});

	it('editing one list item regenerates the whole group, nothing else', () => {
		const src = 'intro   text\n\n- one\n- two\n\noutro   text\n';
		const parsed = parseTypstFile(src);
		const doc = parsed.doc;
		// children: paragraph, list(one), list(two), paragraph
		const target = doc.child(2);
		expect(target.type.name).toBe('list');
		const para = typSchema.nodes.paragraph.create(null, typSchema.text('CHANGED'));
		const replaced = target.type.create({ ...target.attrs }, para, target.marks);
		const kids = [];
		for (let i = 0; i < doc.childCount; i++) kids.push(i === 2 ? replaced : doc.child(i));
		const edited = doc.copy(typSchema.nodes.doc.create(null, kids).content);
		const out = serializeTypstFile(parsed, edited);
		expect(out).toContain('intro   text');
		expect(out).toContain('outro   text');
		expect(out).toContain('- CHANGED');
		expect(out).toContain('- one'); // group member regenerated alongside
	});
});

describe('converted document shape', () => {
	const docOf = (src: string) => typstToProseMirror(src).doc;

	it('headings carry their marker depth as level', () => {
		const doc = docOf('== Second\n\n==== Fourth\n');
		expect(doc.child(0).type.name).toBe('heading');
		expect(doc.child(0).attrs.level).toBe(2);
		expect(doc.child(1).attrs.level).toBe(4);
	});

	it('strong/emph/raw become marks, not chips', () => {
		const para = docOf('has *strong* and _em_ and `code` runs.\n').child(0);
		const marks = new Set<string>();
		para.forEach((n) => n.marks.forEach((m) => marks.add(m.type.name)));
		expect(marks).toEqual(new Set(['strong', 'em', 'code']));
	});

	it('#link with a string target and content becomes a link mark', () => {
		const para = docOf('see #link("https://e.org")[here] now.\n').child(0);
		let href = '';
		let text = '';
		para.forEach((n) => {
			const link = n.marks.find((m) => m.type.name === 'link');
			if (link) {
				href = String(link.attrs.href);
				text = n.text ?? '';
			}
		});
		expect(href).toBe('https://e.org');
		expect(text).toBe('here');
	});

	it('nested bullets nest as list nodes inside the item', () => {
		const doc = docOf('- two\n  - nested\n');
		const item = doc.child(0);
		expect(item.type.name).toBe('list');
		expect(item.child(0).type.name).toBe('paragraph');
		expect(item.child(1).type.name).toBe('list');
		expect(item.child(1).textContent).toBe('nested');
	});

	it('code mode statements and lone calls become raw blocks, inline calls chips', () => {
		const doc = docOf('#let x = 4\n\nText with #strike[x] chip.\n\n#lorem(20)\n');
		expect(doc.child(0).type.name).toBe('raw_latex');
		expect(doc.child(0).textContent).toBe('#let x = 4');
		expect(doc.child(2).type.name).toBe('raw_latex');
		expect(doc.child(2).textContent).toBe('#lorem(20)');
		let chip = '';
		doc.child(1).forEach((n) => {
			if (n.type.name === 'inline_latex') chip = n.textContent;
		});
		expect(chip).toBe('#strike[x]');
	});

	it('#include with a plain .typ string becomes a navigable chip node', () => {
		const doc = docOf('#include "content/methods.typ"\n');
		expect(doc.child(0).type.name).toBe('includedoc');
		expect(doc.child(0).attrs.path).toBe('content/methods.typ');
		expect(doc.child(0).attrs.command).toBe('typst');
	});

	it('include expressions and non-.typ paths stay raw', () => {
		expect(docOf('#include "lib" + suffix\n').child(0).type.name).toBe('raw_latex');
		expect(docOf('#include "data.csv"\n').child(0).type.name).toBe('raw_latex');
	});

	it('#figure(image(...)) becomes an image node; richer figures stay raw', () => {
		const doc = docOf(
			'#figure(image("plots/a.png"), caption: [A caption]) <fig:a>\n\n#figure(image("b.png", width: 70%))\n\n#image("c.svg")\n\n#figure(rect(), caption: [not an image])\n'
		);
		const a = doc.child(0);
		expect(a.type.name).toBe('image');
		expect(a.attrs.src).toBe('plots/a.png');
		expect(a.attrs.label).toBe('fig:a');
		expect(a.attrs.numbered).toBe(true);
		expect(a.textContent).toBe('A caption');
		const b = doc.child(1);
		expect(b.type.name).toBe('image');
		expect(b.attrs.options).toBe('width: 70%');
		expect(b.attrs.showCaption).toBe(false);
		const c = doc.child(2);
		expect(c.type.name).toBe('image');
		expect(c.attrs.numbered).toBe(false);
		expect(doc.child(3).type.name).toBe('raw_latex'); // rect() body: unmodeled, verbatim
	});

	it('simple-grid #table becomes an editable table; unmodelled args ride along verbatim', () => {
		const doc = docOf(
			'#table(\n  columns: 2,\n  table.header([H1], [H2]),\n  [a], [b],\n)\n\n#table(columns: (auto, 1fr), align: (left, right), [x], [y])\n\n#table(columns: 2, stroke: none, [n], [o])\n'
		);
		const t = doc.child(0);
		expect(t.type.name).toBe('table');
		expect(t.attrs.colspec).toBe('2');
		expect(t.childCount).toBe(2); // header row + one body row
		expect(t.child(0).child(0).type.name).toBe('table_header');
		expect(t.child(1).child(1).textContent).toBe('b');
		const tuple = doc.child(1);
		expect(tuple.type.name).toBe('table');
		expect(tuple.attrs.colspec).toBe('(auto, 1fr)');
		expect(tuple.attrs.typAlign).toBe('(left, right)');
		// stroke: has no field in the grid model, but it does not have to: the table is editable
		// and the argument is carried verbatim rather than costing the whole table its node
		const stroked = doc.child(2);
		expect(stroked.type.name).toBe('table');
		expect(stroked.attrs.typArgs).toEqual(['stroke: none']);
	});

	it('a table argument the serializer cannot rebuild still costs the table its node', () => {
		// the raw-island floor: vlines have no row model, so the whole call stays verbatim
		expect(docOf('#table(columns: 2, table.vline(x: 1), [a], [b])\n').child(0).type.name).toBe('raw_latex');
		// ...as does a merged cell carrying more than colspan/rowspan
		expect(docOf('#table(columns: 2, table.cell(fill: red)[a], [b])\n').child(0).type.name).toBe('raw_latex');
	});

	it('hlines, merged cells and bare expression cells all survive a round trip', () => {
		const src =
			'#table(\n  columns: 3,\n  stroke: none,\n  table.hline(),\n  table.cell(colspan: 2)[*Q*], [*U*],\n  table.hline(start: 0, end: 2),\n  $x$, [Position], [m],\n  table.hline(),\n)\n';
		const t = docOf(src).child(0);
		expect(t.type.name).toBe('table');
		expect(t.attrs.typBottomRules).toEqual(['table.hline()']);
		expect(t.child(0).attrs.typRules).toEqual(['table.hline()']);
		expect(t.child(1).attrs.typRules).toEqual(['table.hline(start: 0, end: 2)']);
		expect(t.child(0).child(0).attrs.colspan).toBe(2);
		expect(t.child(0).childCount).toBe(2); // a colspan'd cell plus one, not three
		expect(roundtrip(src)).toBe(src);
	});

	it('#quote(block: true) becomes a blockquote; other quote forms stay raw', () => {
		const doc = docOf('#quote(block: true)[\n  Two roads.\n]\n\n#quote[inline]\n\n#quote(block: true, attribution: [x])[y]\n');
		expect(doc.child(0).type.name).toBe('blockquote');
		expect(doc.child(0).textContent).toBe('Two roads.');
		// both unmodelled quote forms stay raw, a blank line apart, so two islands
		expect(doc.child(1).type.name).toBe('raw_latex');
		expect(doc.child(1).textContent).toBe('#quote[inline]');
		expect(doc.child(2).textContent).toBe('#quote(block: true, attribution: [x])[y]');
		expect(doc.childCount).toBe(3);
	});

	it('#figure(table(...), caption) becomes a captioned table; extra args stay raw', () => {
		const doc = docOf(
			'#figure(\n  table(\n    columns: 2,\n    [a], [1],\n  ),\n  caption: [Results.],\n) <tab:res>\n\n#figure(table(columns: 2, [x], [y], gutter: 4pt), caption: [fancy])\n'
		);
		const w = doc.child(0);
		expect(w.type.name).toBe('table_wrapper');
		expect(w.attrs.label).toBe('tab:res');
		expect(w.child(0).type.name).toBe('table_caption');
		expect(w.child(0).textContent).toBe('Results.');
		expect(w.child(1).type.name).toBe('table');
		expect(doc.child(1).type.name).toBe('raw_latex'); // gutter: is not modeled
	});

	it('term lists become term items with editable title and description', () => {
		const doc = docOf('/ alpha: the first letter\n/ beta: second\n');
		const a = doc.child(0);
		expect(a.type.name).toBe('term_item');
		expect(a.child(0).type.name).toBe('term_title');
		expect(a.child(0).textContent).toBe('alpha');
		expect(a.child(1).textContent).toBe('the first letter');
		expect(doc.child(1).type.name).toBe('term_item');
	});

	it('translatable equations become math nodes carrying latex + original typst', () => {
		const doc = docOf('Inline $x^2$ and $sum_(k=1)^n k$ here.\n\n$ integral_0^1 f(x) dif x $\n');
		const para = doc.child(0);
		const maths: string[] = [];
		para.forEach((n) => {
			if (n.type.name === 'inline_math') maths.push(`${n.attrs.typst}=>${n.textContent}`);
		});
		expect(maths).toEqual(['x^2=>x^2', 'sum_(k=1)^n k=>\\sum_{k = 1}^n k']);
		const block = doc.child(1);
		expect(block.type.name).toBe('block_math');
		expect(block.textContent).toBe('\\int_0^1 f(x) \\mathrm{d} x');
		expect(block.attrs.typst).toBe('integral_0^1 f(x) dif x');
	});

	it('spaced fractions translate: the Space nodes around the slash are layout', () => {
		const doc = docOf('$ (a + b) / 2 $\n\n$ sum_(k=1)^n k = (n (n + 1)) / 2 $\n');
		expect(doc.child(0).type.name).toBe('block_math');
		expect(doc.child(0).textContent).toBe('\\frac{a + b}{2}');
		expect(doc.child(1).type.name).toBe('block_math');
	});

	it('untranslatable equations stay raw islands', () => {
		// what cannot be proved, in rising order of durability: a conversion that silently drops
		// content (norm loses its bars), one MathLive could not render, and typst CODE in math
		const doc = docOf('has $norm(v)$ and $abs(x)$ and $arrow.r$ inline\n\n$ #calc.pow(2, 3) $\n');
		const para = doc.child(0);
		let chips = 0;
		para.forEach((n) => {
			if (n.type.name === 'inline_latex') chips++;
			if (n.type.name === 'inline_math') throw new Error(`unexpected math node for ${n.textContent}`);
		});
		expect(chips).toBe(3);
		expect(doc.child(1).type.name).toBe('raw_latex');
	});

	it('@refs become atoms, a supplement riding on the atom', () => {
		const para = docOf('see @typst2023 and @fig[Figure] here\n').child(0);
		const kinds: string[] = [];
		para.forEach((n) => {
			if (n.type.name === 'typ_ref') kinds.push(`ref:${n.attrs.target}:${n.attrs.supplement}`);
			if (n.type.name === 'inline_latex') kinds.push(`chip:${n.textContent}`);
		});
		expect(kinds).toEqual(['ref:typst2023:null', 'ref:fig:Figure']);
	});

	it('a stale colspec falls back to the real column count', () => {
		const doc = docOf('#table(columns: (auto, 1fr), [x], [y])\n');
		const table = doc.child(0);
		// simulate a context-menu "add column": one more cell per row, colspec left behind
		const row = table.child(0);
		const cells = [];
		row.forEach((c) => cells.push(c));
		cells.push(typSchema.nodes.table_cell.createAndFill()!);
		const grown = table.type.create(table.attrs, typSchema.nodes.table_row.create(null, cells));
		const out = serializeToTypst(typSchema.nodes.doc.create(null, [grown]));
		expect(out).toContain('columns: 3');
		expect(out).not.toContain('(auto, 1fr)');
	});

	it('an image mentioned mid-paragraph stays an inline chip', () => {
		const para = docOf('see #image("x.png") here\n').child(0);
		expect(para.type.name).toBe('paragraph');
		let chip = '';
		para.forEach((n) => {
			if (n.type.name === 'inline_latex') chip = n.textContent;
		});
		expect(chip).toBe('#image("x.png")');
	});

	it('fences become code blocks with their language', () => {
		const block = docOf('```rust\nfn main() {}\n```\n').child(0);
		expect(block.type.name).toBe('code_block');
		expect(block.attrs.args).toBe('rust');
		expect(block.textContent).toBe('fn main() {}');
	});

	it('shorthands and escapes surface as the characters the reader sees', () => {
		const para = docOf('a -- b --- c \\* d\n').child(0);
		expect(para.textContent).toBe('a – b — c * d');
	});

	it('mark calls become real marks; unshared shapes stay chips', () => {
		const doc = docOf(CORPUS.markCalls);
		const markNames = (n: { marks: readonly { type: { name: string }; attrs: Record<string, unknown> }[] }) =>
			n.marks.map((m) => m.type.name);
		const first = doc.child(0);
		const found: Record<string, unknown> = {};
		first.forEach((n) => {
			for (const m of n.marks) found[m.type.name] = m.attrs?.color ?? true;
		});
		// highlight appears twice (bare -> yellow, then fill: lime); the map keeps the last
		expect(found).toEqual({ u: true, sup: true, sub: true, highlight: 'lime', textcolor: 'red' });
		// second paragraph fully underlined must be prose, not a raw island
		expect(doc.child(1).type.name).toBe('paragraph');
		expect(markNames(doc.child(1).child(0))).toEqual(['u']);
		// rgb colors graduate, unshared colors and extra args stay chips
		const third = doc.child(2);
		const chips: string[] = [];
		let cool: string | null = null;
		third.forEach((n) => {
			if (n.type.name === 'inline_latex') chips.push(n.textContent);
			const tc = n.marks.find((m) => m.type.name === 'textcolor');
			if (tc) cool = String(tc.attrs.color);
		});
		expect(cool).toBe('#00ffff');
		expect(chips).toEqual(['#text(fill: eastern)[unshared]', '#underline(stroke: red)[fancy]']);
	});

	it('a labeled equation carries its label; untranslatable ones keep it inside the raw island', () => {
		const doc = docOf(CORPUS.eqLabels);
		// found by type, not by index: the fixture opens with a #set line (typst will not reference
		// an unnumbered equation) and positional assertions would only be measuring that preamble
		const blocks: Node[] = [];
		doc.forEach((n) => blocks.push(n));
		const math = blocks.find((n) => n.type.name === 'block_math')!;
		expect(math.attrs.label).toBe('eq:mass');
		// the raw island absorbs the label bytes so nothing is lost. Typst CODE in math is the
		// durable example of untranslatable: no math converter should ever render #calc.pow
		const island = blocks.find((n) => n.type.name === 'raw_latex' && n.textContent.startsWith('$ #calc'))!;
		expect(island.textContent).toBe('$ #calc.pow(2, 3) $ <eq:id>');
		// serializer re-emits the label after the closing dollar (stored typst, latex untouched)
		const out = serializeToTypst(typSchema.nodes.doc.create(null, [math.type.create(math.attrs, math.content)]));
		expect(out).toBe('$ E = m c^2 $ <eq:mass>');
	});

	it('a label ADDED through the gear reaches the file (attrs-only edit)', () => {
		// the gear's setNodeMarkup changes attrs and nothing else: another node, which the parse
		// no longer knows, so the block regenerates with its label
		const doc = docOf('$ E = m c^2 $\n');
		const eq = doc.child(0);
		expect(eq.attrs.label).toBeNull();
		const labeled = typSchema.nodes.doc.create(null, [eq.type.create({ ...eq.attrs, label: 'eq:mass' }, eq.content)]);
		expect(serializeToTypst(labeled)).toBe('$ E = m c^2 $ <eq:mass>');
	});

	it('the canonical full-width line is a divider; other lengths stay raw', () => {
		const doc = docOf(CORPUS.hr);
		expect(doc.child(1).type.name).toBe('horizontal_rule');
		expect(doc.child(3).type.name).toBe('raw_latex');
	});

	it('a linebreak becomes a hard_break without a stray continuation space', () => {
		const para = docOf('one \\\ntwo\n').child(0);
		const parts: string[] = [];
		para.forEach((n) => parts.push(n.type.name === 'hard_break' ? '<br>' : (n.text ?? '')));
		expect(parts.join('')).toBe('one <br>two');
	});
});

describe('escTypst', () => {
	it('escapes markup structure and leaves prose alone', () => {
		expect(escTypst('a *b* _c_ #d $e$ `f` [g] <h> @ref ~x')).toBe('a \\*b\\* \\_c\\_ \\#d \\$e\\$ \\`f\\` \\[g\\] \\<h> \\@ref \\~x');
	});
	it('keeps intraword underscores and bare @ intact', () => {
		expect(escTypst('snake_case_word stays @ home')).toBe('snake_case_word stays @ home');
	});
	it('breaks up comment openers', () => {
		expect(escTypst('http://x and //note')).toBe('http:\\//x and \\//note');
	});
	it('escapes line-start markers only at line start', () => {
		expect(escTypst('- dash', true)).toBe('\\- dash');
		expect(escTypst('3. item', true)).toBe('3\\. item');
		expect(escTypst('a - dash', true)).toBe('a - dash');
	});
});

describe('image drag-resize (wysiwym)', () => {
	it('snapped pixel width serializes as a percent, replacing an existing width option', () => {
		const doc = typstToProseMirror('#figure(image("a.png", width: 70%, fit: "cover"), caption: [Cap])\n').doc;
		const img = doc.child(0);
		const resized = img.type.create({ ...img.attrs, width: 300, height: 200, maxWidth: 600 }, img.content, img.marks);
		const out = serializeToTypst(typSchema.nodes.doc.create(null, [resized]));
		expect(out).toContain('image("a.png", width: 50%, fit: "cover")');
	});

	it('untouched images keep their options verbatim', () => {
		const src = '#figure(image("a.png", width: 70%), caption: [Cap])\n';
		expect(roundtrip(src)).toBe(src);
	});
});

describe('copy as typst', () => {
	it('block and inline slices serialize to typst markup', () => {
		const src = 'Some *bold* and #underline[under] text.\n\n= Heading\n';
		const doc = typstToProseMirror(src).doc;
		expect(sliceToTypst(new Slice(doc.content, 0, 0))).toBe(src.trimEnd());
		// a selection inside one paragraph wraps in a paragraph before serializing
		const para = doc.child(0);
		expect(sliceToTypst(new Slice(para.content, 0, 0))).toBe('Some *bold* and #underline[under] text.');
	});
});

describe('table inserters', () => {
	// what the source toolbar's grid picker writes into an empty document
	const skeleton = (opts: Parameters<typeof computeTableSkeleton>[1]) => {
		const state = EditorState.create({ doc: '' });
		return state.update(computeTableSkeleton(state, opts)).state.doc.toString();
	};

	it('source skeleton honors the picked size', () => {
		expect(skeleton({ rows: 3, cols: 3, header: true, figure: false })).toBe(
			'#table(\n  columns: 3,\n  table.header([Column], [Column], [Column]),\n  [], [], [],\n  [], [], [],\n)\n'
		);
	});

	it('source skeleton without a header keeps every row plain', () => {
		expect(skeleton({ rows: 2, cols: 2, header: false, figure: false })).toBe('#table(\n  columns: 2,\n  [], [],\n  [], [],\n)\n');
	});

	it('the figure form graduates into a table_wrapper and regenerates identically', () => {
		const src = skeleton({ rows: 2, cols: 2, header: true, figure: true });
		const doc = typstToProseMirror(src).doc;
		expect(doc.child(0).type.name).toBe('table_wrapper');
		// the doc-level serializer drops the final block separator; the file round-trip re-adds it
		expect(serializeToTypst(doc)).toBe(src.trimEnd());
	});

	it('visual typTableNode makes rows x cols with a header row, and numbered wraps in a figure', () => {
		const plain = typTableNode(typSchema, 4, 3);
		expect(plain.childCount).toBe(4);
		expect(plain.child(0).childCount).toBe(3);
		expect(plain.child(0).child(0).type.name).toBe('table_header');
		expect(plain.child(1).child(0).type.name).toBe('table_cell');

		const numbered = typTableNode(typSchema, 2, 2, true);
		expect(numbered.type.name).toBe('table_wrapper');
		const out = serializeToTypst(typSchema.nodes.doc.create(null, [numbered]));
		expect(out).toContain('#figure(\n  table(\n    columns: 2,');
		// the caption starts empty and typst captions are optional: no placeholder text published
		expect(out).not.toContain('caption:');
		expect(out).toMatch(/<texpile-table-[0-9a-f]{12}>/);
	});

	it('visual typTableNode with the header switch off keeps every row plain', () => {
		const plain = typTableNode(typSchema, 3, 2, false, false);
		expect(plain.child(0).child(0).type.name).toBe('table_cell');
		const out = serializeToTypst(typSchema.nodes.doc.create(null, [plain]));
		expect(out).not.toContain('table.header');
	});
});

describe('merging cells through the real prosemirror-tables command', () => {
	// The context menu offers Merge/Split for every dialect whose serializer has a spanning form
	// (ContextMenu's cellMerging flag). Typst only earned that when table.cell(colspan:) started
	// round-tripping, so this drives the ACTUAL command rather than trusting the flag.
	it('produces a spanning cell that re-parses to the same table', () => {
		const doc = typstToProseMirror('#table(\n  columns: 2,\n  [a], [b],\n  [c], [d],\n)\n').doc;
		const state = EditorState_pm.create({ schema: typSchema, doc });
		const cells: number[] = [];
		doc.descendants((n, pos) => {
			if (n.type.name === 'table_cell') cells.push(pos);
		});
		let out = '';
		mergeCells(state.apply(state.tr.setSelection(CellSelection.create(doc, cells[0], cells[1]))), (tr) => {
			out = serializeToTypst(tr.doc);
		});
		expect(out).toContain('table.cell(colspan: 2)');
		// the merged table must survive a reparse unchanged, or the next save drifts
		expect(serializeToTypst(typstToProseMirror(out).doc)).toBe(out);
		const table = typstToProseMirror(out).doc.child(0);
		expect(table.type.name).toBe('table');
		expect(table.child(0).child(0).attrs.colspan).toBe(2);
		expect(table.child(0).childCount).toBe(1); // one spanning cell, not two
	});
});
