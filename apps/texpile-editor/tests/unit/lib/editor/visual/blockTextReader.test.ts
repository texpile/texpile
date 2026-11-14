import { it, expect } from 'vitest';
import { schema } from '$lib/languages/latex/schema/latexPMSchema';
import { blockTextReader } from '$lib/editor/visual/blockTextReader';

// a parse's runs are checked against the text they show, and a wrong answer here marks a sound block unsound:
// it would be written afresh on the next save in place of its own bytes
it('reads the same text as the document does, inside a block and across two', () => {
	const doc = schema.node('doc', null, [
		schema.node('paragraph', null, [schema.text('first words')]),
		schema.node('paragraph', null, [schema.text('second '), schema.text('part', [schema.marks.strong.create()])])
	]);
	const read = blockTextReader(doc);
	for (const [from, to] of [
		[1, 6],
		[14, 25],
		[20, 25],
		[3, 18]
	])
		expect(read(from, to)).toBe(doc.textBetween(from, to));
});
