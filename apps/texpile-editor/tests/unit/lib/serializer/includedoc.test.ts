import { describe, it, expect } from 'vitest';
import type { Node } from 'prosemirror-model';
import { treeToProseMirror } from '$lib/languages/latex/parser/tree/importTree';
import { serializeToLatex } from '../../../../src/lib/languages/latex/serializer/latexSerializer';

function parse(latex: string): Node {
	return treeToProseMirror(latex, {}).doc;
}

function find(doc: Node, type: string): Node | null {
	let hit: Node | null = null;
	doc.descendants((n) => {
		if (!hit && n.type.name === type) hit = n;
		return !hit;
	});
	return hit;
}

describe('includedoc (\\input / \\include / \\subfile)', () => {
	it('parses \\input into an includedoc node with the verbatim path', () => {
		const node = find(parse('\\input{sections/intro}'), 'includedoc');
		expect(node).not.toBeNull();
		expect(node!.attrs.path).toBe('sections/intro');
		expect(node!.attrs.command).toBe('input');
	});

	it('keeps the original command (\\include, \\subfile)', () => {
		expect(find(parse('\\include{chapter1}'), 'includedoc')!.attrs.command).toBe('include');
		expect(find(parse('\\subfile{parts/a}'), 'includedoc')!.attrs.command).toBe('subfile');
	});

	it('serializes back to the exact command + path (no \\par, no escaping)', () => {
		expect(serializeToLatex(parse('\\input{sections/intro}')).trim()).toBe('\\input{sections/intro}');
		expect(serializeToLatex(parse('\\include{chapter1}')).trim()).toBe('\\include{chapter1}');
		// an underscore in the path must not be text-escaped (it lives in the path attr)
		expect(serializeToLatex(parse('\\input{my_section}')).trim()).toBe('\\input{my_section}');
	});

	it('round-trips to a fixed point', () => {
		for (const src of ['\\input{a}', '\\include{ch/two}', '\\subfile{x_y}']) {
			const once = serializeToLatex(parse(src)).trim();
			const twice = serializeToLatex(parse(once)).trim();
			expect(twice).toBe(once);
		}
	});

	it('keeps prose around an include as normal paragraphs', () => {
		const doc = parse('Intro text.\n\n\\input{body}\n\nMore text.');
		expect(find(doc, 'includedoc')).not.toBeNull();
		const out = serializeToLatex(doc);
		expect(out).toContain('\\input{body}');
		expect(out).toContain('Intro text.');
		expect(out).toContain('More text.');
	});
});
