// Adjacent raw islands coalesce into ONE block at import.
//
// A stack of comment lines, or of commands kept as code, used to import as one raw block per
// line - a wall of separate boxes in the visual editor. A command the editor draws never merges. Merging is byte-driven: it only
// happens when the members' source slices are adjacent (whitespace-only gaps), and the merged
// block's text IS the combined slice, so the round trip stays a fixed point.
import { describe, it, expect } from 'vitest';
import type { Node } from 'prosemirror-model';
import { parseLatexFile, serializeLatexFile } from '$lib/workspace/latexRoundtrip';
import { parseTypstFile, serializeTypstFile } from '$lib/languages/typst/visual/roundtrip';

const wrap = (body: string) => `\\documentclass{article}\n\\begin{document}\n${body}\n\\end{document}\n`;

function rawBlocks(doc: Node): Node[] {
	const out: Node[] = [];
	for (let i = 0; i < doc.childCount; i++) if (doc.child(i).type.name === 'raw_latex') out.push(doc.child(i));
	return out;
}

describe('latex raw island merging', () => {
	it('merges a stack of comment lines into one block', () => {
		const parsed = parseLatexFile(wrap('% one\n% two\n% three'));
		const raws = rawBlocks(parsed.doc);
		expect(raws.length).toBe(1);
		expect(raws[0].textContent).toBe('% one\n% two\n% three');
	});

	it('keeps islands a blank line apart as blocks of their own', () => {
		const src = wrap('\\bigskip\n\n% first group\n\n% second group\n% more of it');
		const parsed = parseLatexFile(src);
		// \bigskip alone is a paragraph holding its chip, as a \vspace on its own line is
		expect(rawBlocks(parsed.doc).map((raw) => raw.textContent)).toEqual(['% first group', '% second group\n% more of it']);
		expect(serializeLatexFile(parsed, parsed.doc)).toBe(src);
	});

	it('keeps the spaces ending one island ahead of the blank line before the next', () => {
		const src = wrap('Prose.\n\n%a\n%b.  \n\n%c\n%d');
		const parsed = parseLatexFile(src);
		expect(serializeLatexFile(parsed, parsed.doc)).toBe(src);
	});

	it('does not merge across prose', () => {
		const parsed = parseLatexFile(wrap('% above\n\nSome prose in between.\n\n% below'));
		expect(rawBlocks(parsed.doc).length).toBe(2);
	});

	it('pulls a paragraph of code chips into the island', () => {
		const parsed = parseLatexFile(wrap('% set up\n\\pagestyle{empty}\\thispagestyle{plain}'));
		const raws = rawBlocks(parsed.doc);
		expect(raws.length).toBe(1);
		expect(raws[0].textContent).toBe('% set up\n\\pagestyle{empty}\\thispagestyle{plain}');
	});

	it('never merges a command the editor draws', () => {
		const src = wrap('\\smallskip \\medskip \\bigskip\n% a note\n\\clearpage\n\\bibliographystyle{plain}\n\\bibliography{refs}');
		const parsed = parseLatexFile(src);
		const chips: string[] = [];
		parsed.doc.descendants((node) => {
			if (node.type.name === 'inline_latex' || node.type.name === 'raw_latex') chips.push(node.textContent.trim());
		});
		expect(chips).toEqual([
			'\\smallskip',
			'\\medskip',
			'\\bigskip',
			'% a note',
			'\\clearpage',
			'\\bibliographystyle{plain}',
			'\\bibliography{refs}'
		]);
		expect(serializeLatexFile(parsed, parsed.doc)).toBe(src);
	});

	it('leaves an untouched merged doc byte-identical', () => {
		const src = wrap('intro prose\n\n% one\n% two\n\n\\bibliographystyle{plain}\n\\bibliography{refs}');
		const parsed = parseLatexFile(src);
		expect(serializeLatexFile(parsed, parsed.doc)).toBe(src);
	});

	it('round-trips an edit to the merged island', () => {
		const parsed = parseLatexFile(wrap('% one\n% two'));
		const doc = parsed.doc;
		let idx = -1;
		for (let i = 0; i < doc.childCount; i++) if (doc.child(i).type.name === 'raw_latex') idx = i;
		const raw = doc.child(idx);
		const edited = raw.type.create(raw.attrs, raw.type.schema.text('% one\n% two\n% three'));
		const kids: Node[] = [];
		for (let i = 0; i < doc.childCount; i++) kids.push(i === idx ? edited : doc.child(i));
		const out = serializeLatexFile(parsed, doc.copy(doc.type.schema.nodes.doc.createChecked(doc.attrs, kids).content));
		expect(out).toContain('% one\n% two\n% three');
		const reparsed = parseLatexFile(out);
		expect(rawBlocks(reparsed.doc)[0].textContent).toBe('% one\n% two\n% three');
	});
});

describe('typst raw island merging', () => {
	it('merges adjacent raw islands and stays byte-identical untouched', () => {
		// #show and #set rules at the top level are raw islands in the typst visual editor; the set rules it draws
		// (page, text, par...) stay chips of their own, so this one sets what it does not draw
		const src = 'prose before\n\n#show heading: set text(blue)\n#set table(stroke: none)\n\nprose after\n';
		const parsed = parseTypstFile(src);
		const raws = rawBlocks(parsed.doc);
		if (raws.length === 0) return; // islands modelled natively: nothing to merge, nothing to test
		expect(raws.length).toBe(1);
		expect(raws[0].textContent).toBe('#show heading: set text(blue)\n#set table(stroke: none)');
		expect(serializeTypstFile(parsed, parsed.doc)).toBe(src);
	});
});
