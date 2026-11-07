import { describe, expect, it } from 'vitest';
import { schema } from '$lib/languages/latex/schema/latexPMSchema';
import { serializeToLatex } from '$lib/languages/latex/serializer/latexSerializer';
import type { TextStyle } from '$lib/languages/latex/parser/tree/convert/textStyleRuns';

// a document's last paragraph ends in the \par the serializer writes
const written = (doc: Parameters<typeof serializeToLatex>[0]) => serializeToLatex(doc).replace(/\s*\\par\s*$/, '');

const small: TextStyle = { command: 'small', form: 'bare', sep: '{}' };

function paragraph(...runs: [string, TextStyle[] | null][]) {
	const nodes = runs.map(([text, styles]) => schema.text(text, styles ? [schema.marks.text_style.create({ styles })] : []));
	return schema.nodes.doc.create(null, schema.nodes.paragraph.create(null, nodes));
}

describe('scopeTextStyles', () => {
	it('writes a bare switch as a group where text after it went unstyled', () => {
		expect(written(paragraph(['small ', [small]], ['plain', null]))).toBe(String.raw`{\small{}small }plain`);
	});

	it('writes a bare switch once while it stays in force', () => {
		const doc = schema.nodes.doc.create(
			null,
			schema.nodes.paragraph.create(null, [
				schema.text('a ', [schema.marks.text_style.create({ styles: [small] })]),
				schema.text('b', [schema.marks.text_style.create({ styles: [small] }), schema.marks.strong.create()]),
				schema.text(' c', [schema.marks.text_style.create({ styles: [small] })])
			])
		);
		expect(written(doc)).toBe(String.raw`\small{}a \textbf{b} c`);
	});
});
