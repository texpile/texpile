import { describe, it, expect } from 'vitest';
import type { Node } from 'prosemirror-model';
import * as LatexParser from '$lib/languages/latex/parser/latexParser';
import { schema } from '$lib/languages/latex/schema/latexPMSchema';
import { serializeToLatex } from '../../../../src/lib/languages/latex/serializer/latexSerializer';

function parse(latex: string): Node {
	return LatexParser.latexToProseMirror(latex, {}).doc;
}
function has(doc: Node, type: string): boolean {
	let found = false;
	doc.descendants((n) => {
		if (n.type.name === type) found = true;
		return !found;
	});
	return found;
}

// WYSIWYM: an empty paragraph means nothing in LaTeX (blank lines collapse to one parbreak), so
// it serializes to nothing. the old private protocol of emitting \vspace{\baselineskip} so an
// editor blank line survived reload is gone; every \vspace is a real spacing command now and
// round-trips verbatim as a raw inline chip.
describe('\\vspace round-trips verbatim; blank lines are semantic no-ops', () => {
	it('parses \\vspace{\\baselineskip} to a raw chip (not a hard_break)', () => {
		const doc = parse(String.raw`a\par\vspace{\baselineskip}\par b`);
		expect(has(doc, 'inline_latex')).toBe(true);
		expect(has(doc, 'hard_break')).toBe(false);
	});

	it('preserves any \\vspace as raw inline LaTeX', () => {
		expect(has(parse(String.raw`x\vspace{2cm}y`), 'inline_latex')).toBe(true);
		expect(has(parse(String.raw`x\vspace*{1em}y`), 'inline_latex')).toBe(true);
		expect(has(parse(String.raw`x\vspace{\baselineskip}y`), 'inline_latex')).toBe(true);
	});

	it('keeps \\vspace{\\baselineskip} in the output and reaches a fixed point', () => {
		const src = String.raw`a\par\vspace{\baselineskip}\par b`;
		const once = serializeToLatex(parse(src));
		const twice = serializeToLatex(parse(once));
		expect(once).toContain('\\vspace{\\baselineskip}');
		expect(twice).toBe(once);
	});

	it('serializes an empty paragraph to nothing', () => {
		const doc = schema.nodes.doc.create(null, [
			schema.nodes.paragraph.create(null, schema.text('a')),
			schema.nodes.paragraph.create(),
			schema.nodes.paragraph.create(null, schema.text('b'))
		]);
		const out = serializeToLatex(doc);
		expect(out).not.toContain('\\vspace');
		expect(out).toBe('a\n\nb \\par');
	});

	it('serializes a legacy lineBreak:false hard_break to nothing', () => {
		const doc = schema.nodes.doc.create(null, [
			schema.nodes.paragraph.create(null, [schema.text('a'), schema.nodes.hard_break.create({ lineBreak: false }), schema.text('b')])
		]);
		const out = serializeToLatex(doc);
		expect(out).not.toContain('\\vspace');
		expect(out).toContain('ab');
	});
});

describe('\\\\ line break round-trips as \\\\', () => {
	const flushleft = String.raw`\begin{flushleft}
First Last \\
Professor Name \\
\today
\end{flushleft}`;

	it('keeps \\\\ (not \\vspace) and adds no leading space', () => {
		const out = serializeToLatex(parse(flushleft));
		expect(out).toContain('First Last \\\\');
		expect(out).toContain('Professor Name \\\\');
		expect(out).not.toContain('\\vspace{\\baselineskip}');
		expect(out).not.toMatch(/\n Professor Name/); // no stray leading space after the break
	});

	it('reaches a fixed point', () => {
		const once = serializeToLatex(parse(flushleft));
		const twice = serializeToLatex(parse(once));
		expect(twice).toBe(once);
	});
});

// a break with nothing drawn before it in its block was written as a bare \\, which stops a real
// compile ("There's no line here to end"): Shift+Enter at the start of an item, or after a \label
describe('a line break opening its line', () => {
	const br = () => schema.nodes.hard_break.create({ lineBreak: true });
	const item = (content: Node[]) =>
		schema.nodes.doc.create(null, [schema.nodes.list.create({ kind: 'bullet' }, [schema.nodes.paragraph.create(null, content)])]);

	it('gets an empty box to end, and reads back as the break alone', () => {
		const doc = item([br(), schema.text('Second.')]);
		const out = serializeToLatex(doc);
		expect(out).toContain('\\item \\mbox{}\\\\');
		expect(parse(out).toString()).toBe(doc.toString());
		expect(serializeToLatex(parse(out))).toBe(out);
	});

	it('after a \\label too, which draws nothing', () => {
		const p = schema.nodes.paragraph.create(null, [schema.nodes.label.create({ name: 'x' }), br(), schema.text('more')]);
		expect(serializeToLatex(schema.nodes.doc.create(null, [p]))).toContain('\\mbox{}\\\\');
	});

	it('takes no box after words', () => {
		const out = serializeToLatex(item([schema.text('First'), br(), schema.text('Second.')]));
		expect(out).not.toContain('\\mbox');
	});
});
