import { describe, expect, it } from 'vitest';
import { schema } from '$lib/languages/latex/schema/latexPMSchema';
import { serializeToLatex } from '$lib/languages/latex/serializer/latexSerializer';

function write(variant: string): string {
	const chip = schema.nodes.citation.create({ variant, prenote: 'see', postnote: 'p. 3' }, schema.text('key'));
	return serializeToLatex(schema.nodes.doc.create(null, schema.nodes.paragraph.create(null, chip))).trim();
}

describe('citation notes', () => {
	it.each([
		['cite', String.raw`\cite[see][p. 3]{key}`],
		['textcite', String.raw`\textcite[see][p. 3]{key}`],
		['autocite', String.raw`\autocite[see][p. 3]{key}`],
		['supercite', String.raw`\supercite{key}`]
	])('writes \\%s with the notes its arguments take', (variant, expected) => {
		expect(write(variant)).toContain(expected);
	});
});
