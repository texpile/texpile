import { describe, expect, it } from 'vitest';
import { schema } from '$lib/languages/latex/schema/latexPMSchema';
import { triggerBefore } from '$lib/editor/visual/extensions/suggest/triggerBefore';

const WORD = /[a-zA-Z0-9\s_]/;

describe('triggerBefore', () => {
	it('reads the query across an inline atom and stops at a character a query cannot hold', () => {
		const atom = schema.nodes.citation.createAndFill()!;
		const paragraph = schema.nodes.paragraph.create(null, [schema.text('see @kn'), atom, schema.text('uth. and @')]);
		const afterAtom = 'see @kn'.length + atom.nodeSize + 'uth'.length;
		expect(triggerBefore(paragraph, afterAtom, '@', WORD)).toEqual({ at: 4, query: 'knuth' });
		expect(triggerBefore(paragraph, afterAtom + 2, '@', WORD)).toBeNull();
		expect(triggerBefore(paragraph, paragraph.content.size, '@', WORD)).toEqual({ at: paragraph.content.size - 1, query: '' });
	});
});
