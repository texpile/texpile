// The Typst chips the visual editor draws (footnotes, breaks, spaces, outlines, set rules) through the round trip: a
// document opened and saved untouched keeps every byte, each drawn call stands as a chip of its own, and a setting
// changed in a chip's panel rewrites that chip's argument and nothing else in the file
import { describe, it, expect } from 'vitest';
import { EditorState } from 'prosemirror-state';
import type { Node } from 'prosemirror-model';
import { parseTypstFile, serializeTypstFile } from '$lib/languages/typst/visual/roundtrip';
import { typstToProseMirror } from '$lib/languages/typst/visual/convert/converter';
import { serializeToTypst } from '$lib/languages/typst/visual/serialize/serializer';
import { readTypstCall, rewrittenCall } from '$lib/languages/typst/visual/extensions/drawn/typstCall';
import { writeSetField, readSetRule } from '$lib/languages/typst/visual/extensions/drawn/setRule/setRuleCall';
import { writeFootnote } from '$lib/languages/typst/visual/extensions/drawn/footnoteCall';
import { equationNumberingChange, equationsNumbered } from '$lib/languages/typst/visual/equationNumbering';

export const DRAWN_CORPUS: Record<string, string> = {
	pageSetup:
		'#set page(paper: "a4", margin: (x: 2.5cm, y: 2cm), numbering: "1")\n#set text(font: "Libertinus Serif", size: 11pt, lang: "en")\n#set par(justify: true, leading: 0.65em, first-line-indent: 1em)\n#set heading(numbering: "1.1")\n#set document(title: [A Report], author: ("A. Author", "B. Author"))\n#set math.equation(numbering: "(1)")\n\n#outline(title: [Contents], depth: 2)\n\n= Introduction\n\nText.\n',
	everyday:
		'= Notes\n\nA claim#footnote[A *source* for it.] and a second#footnote[Another.] one, with #h(1em) room and #h(1fr) fill.\n\n#v(1em + 2pt, weak: true)\n\nMore text.\n\n#pagebreak(weak: true)\n\n#outline(target: figure.where(kind: image), title: none)\n\n#colbreak()\n\n#v(2cm)\n',
	oddlyWritten:
		'#set page(\n  paper: "a5", // small\n  margin: 1cm,\n)\n#set text(lang: "de") if true\n#let gap = 1em\n#set par(justify:true)\n\nText#footnote(numbering: "*")[starred] here.\n\n#v(gap)\n'
};

function roundtrip(src: string): string {
	const parsed = parseTypstFile(src);
	return serializeTypstFile(parsed, parsed.doc);
}

function blocksOf(doc: Node): string[] {
	const out: string[] = [];
	doc.forEach((child) => out.push(`${child.type.name}:${child.textContent}`));
	return out;
}

/** the file after one raw chip's source is changed, the way a chip's panel writes it */
function editChip(src: string, from: string, to: (source: string) => string | null): string {
	const parsed = parseTypstFile(src);
	const state = EditorState.create({ doc: parsed.doc });
	let at = -1;
	state.doc.descendants((node, pos) => {
		if ((node.type.name === 'raw_latex' || node.type.name === 'inline_latex') && node.textContent === from) at = pos;
		return at < 0;
	});
	if (at < 0) throw new Error(`no chip ${from}`);
	const chip = state.doc.nodeAt(at)!;
	const next = to(chip.textContent);
	if (next === null) throw new Error(`no write for ${from}`);
	const tr = state.tr.replaceWith(at + 1, at + chip.nodeSize - 1, state.schema.text(next));
	return serializeTypstFile(parsed, tr.doc);
}

describe('drawn chips keep a no-edit save byte-identical', () => {
	for (const [name, src] of Object.entries(DRAWN_CORPUS)) {
		it(name, () => expect(roundtrip(src)).toBe(src));
	}
	for (const [name, src] of Object.entries(DRAWN_CORPUS)) {
		it(`${name} regenerates to a fixed point`, () => {
			const once = serializeToTypst(typstToProseMirror(src).doc);
			expect(serializeToTypst(typstToProseMirror(once).doc)).toBe(once);
		});
	}
});

describe('a drawn call is a chip of its own', () => {
	it('keeps each set rule apart instead of merging the run into one code block', () => {
		const blocks = blocksOf(typstToProseMirror(DRAWN_CORPUS.pageSetup).doc);
		expect(blocks.slice(0, 7)).toEqual([
			'raw_latex:#set page(paper: "a4", margin: (x: 2.5cm, y: 2cm), numbering: "1")',
			'raw_latex:#set text(font: "Libertinus Serif", size: 11pt, lang: "en")',
			'raw_latex:#set par(justify: true, leading: 0.65em, first-line-indent: 1em)',
			'raw_latex:#set heading(numbering: "1.1")',
			'raw_latex:#set document(title: [A Report], author: ("A. Author", "B. Author"))',
			'raw_latex:#set math.equation(numbering: "(1)")',
			'raw_latex:#outline(title: [Contents], depth: 2)'
		]);
	});

	it('still merges the code no panel can show', () => {
		const blocks = blocksOf(typstToProseMirror(DRAWN_CORPUS.oddlyWritten).doc);
		expect(blocks[1]).toBe('raw_latex:#set text(lang: "de") if true\n#let gap = 1em');
		expect(blocks[2]).toBe('raw_latex:#set par(justify:true)');
	});

	it('keeps footnotes and horizontal spaces among the words', () => {
		const para = typstToProseMirror(DRAWN_CORPUS.everyday).doc.child(1);
		const chips: string[] = [];
		para.forEach((child) => {
			if (child.type.name === 'inline_latex') chips.push(child.textContent);
		});
		expect(chips).toEqual(['#footnote[A *source* for it.]', '#footnote[Another.]', '#h(1em)', '#h(1fr)']);
	});
});

describe('a setting changed in a panel rewrites only its argument', () => {
	it('a set rule field', () => {
		const src = DRAWN_CORPUS.oddlyWritten;
		const out = editChip(src, '#set page(\n  paper: "a5", // small\n  margin: 1cm,\n)', (source) => {
			const rule = readSetRule(source)!;
			return writeSetField(
				rule,
				rule.fields.find((field) => field.name === 'paper')!,
				'a4'
			);
		});
		expect(out).toBe(src.replace('"a5"', '"a4"'));
	});

	it('a field added to a rule on lines of its own', () => {
		const src = DRAWN_CORPUS.oddlyWritten;
		const out = editChip(src, '#set page(\n  paper: "a5", // small\n  margin: 1cm,\n)', (source) => {
			const rule = readSetRule(source)!;
			return writeSetField(
				rule,
				rule.fields.find((field) => field.name === 'columns')!,
				'2'
			);
		});
		expect(out).toBe(src.replace('  margin: 1cm,\n', '  margin: 1cm,\n  columns: 2,\n'));
	});

	it('a footnote note among the words', () => {
		const src = DRAWN_CORPUS.everyday;
		const out = editChip(src, '#footnote[Another.]', (source) => writeFootnote(source, 'Another *one*.'));
		expect(out).toBe(src.replace('#footnote[Another.]', '#footnote[Another *one*.]'));
	});

	it('a rule with a comment after it on its line', () => {
		const src = '#set page(paper: "a4") // for print\n#set text(size: 11pt); #set par(justify: true)\n\nText.\n';
		expect(roundtrip(src)).toBe(src);
		// the comment ending the rule's line stays with it, in its chip
		const out = editChip(src, '#set page(paper: "a4") // for print', (source) => {
			const rule = readSetRule(source)!;
			return writeSetField(
				rule,
				rule.fields.find((field) => field.name === 'paper')!,
				'a5'
			);
		});
		expect(out).toBe(src.replace('"a4"', '"a5"'));
	});

	it('a space amount', () => {
		const src = DRAWN_CORPUS.everyday;
		const out = editChip(src, '#v(1em + 2pt, weak: true)', (source) => rewrittenCall(readTypstCall(source)!, { named: { weak: null } }));
		expect(out).toBe(src.replace('#v(1em + 2pt, weak: true)', '#v(1em + 2pt)'));
	});
});

describe('the equations switch writes the one rule that numbers them', () => {
	const EQUATION = '$ E = m c^2 $ <eq:e>\n';

	function toggled(src: string, numbered: boolean): string {
		const parsed = parseTypstFile(src);
		const state = EditorState.create({ doc: parsed.doc });
		const tr = equationNumberingChange(state, numbered);
		return tr ? serializeTypstFile(parsed, tr.doc) : src;
	}

	it('reads the rule the document has', () => {
		expect(equationsNumbered(typstToProseMirror(DRAWN_CORPUS.pageSetup).doc)).toBe(true);
		expect(equationsNumbered(typstToProseMirror('#set math.equation(numbering: none)\n\n' + EQUATION).doc)).toBe(false);
		expect(equationsNumbered(typstToProseMirror(EQUATION).doc)).toBe(false);
	});

	it('adds it after the set rules the document opens with', () => {
		const src = '#import "lib.typ": report\n#set page(paper: "a4")\n#set text(lang: "en")\n\n= Intro\n\n' + EQUATION;
		expect(toggled(src, true)).toBe(
			'#import "lib.typ": report\n#set page(paper: "a4")\n#set text(lang: "en")\n#set math.equation(numbering: "(1)")\n\n= Intro\n\n' +
				EQUATION
		);
	});

	it('adds it at the top of a document with no rules', () => {
		expect(toggled('= Intro\n\n' + EQUATION, true)).toBe('#set math.equation(numbering: "(1)")\n\n= Intro\n\n' + EQUATION);
	});

	it('keeps the pattern the document chose, and turning off takes the rule out', () => {
		const src = '#set page(paper: "a4")\n#set math.equation(numbering: "1.")\n\n' + EQUATION;
		expect(toggled(src, true)).toBe(src);
		expect(toggled(src, false)).toBe('#set page(paper: "a4")\n\n' + EQUATION);
	});

	it('takes only numbering out of a rule that sets more, and sets it in a rule that has none', () => {
		const src = '#set math.equation(numbering: "(1)", supplement: [Eq.])\n\n' + EQUATION;
		expect(toggled(src, false)).toBe('#set math.equation(supplement: [Eq.])\n\n' + EQUATION);
		expect(toggled('#set math.equation(numbering: none)\n\n' + EQUATION, true)).toBe('#set math.equation(numbering: "(1)")\n\n' + EQUATION);
	});
});
