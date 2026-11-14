import { it, expect } from 'vitest';
import { schema } from '$lib/languages/latex/schema/latexPMSchema';
import { rebreakLimit } from '$lib/editor/visual/linebreak/rebreak/rebreakLimit';

it('is reached by the seventh move in a second, and an edit starts the count again', () => {
	const paragraph = schema.nodes.paragraph.create(null, schema.text('words'));
	const limit = rebreakLimit();
	for (let move = 0; move < 6; move++) expect(limit.reached(paragraph)).toBe(false);
	expect(limit.reached(paragraph)).toBe(true);
	limit.reset();
	expect(limit.reached(paragraph)).toBe(false);
});
