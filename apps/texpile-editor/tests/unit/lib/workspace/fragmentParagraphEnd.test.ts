import { describe, expect, it } from 'vitest';
import { parseLatexFile, serializeLatexFile } from '$lib/workspace/latexRoundtrip';
import { schema } from '$lib/languages/latex/schema/latexPMSchema';
import { withoutOrigins } from '$lib/editor/visual/parseOrigins';

describe('a fragment file saved from the visual editor', () => {
	it('ends its last paragraph without a \\par, as a document does', () => {
		const parsed = parseLatexFile('');
		const doc = schema.node('doc', null, [schema.node('paragraph', null, [schema.text('Only paragraph')])]);
		expect(serializeLatexFile(parsed, doc)).toBe('Only paragraph\n');
	});

	it('keeps its trailing blank lines as they were, save after save', () => {
		const src = 'First.\n\nThe last line.\n% a comment that ends the file.\n\n\n';
		const regenerate = (text: string) => {
			const parsed = parseLatexFile(text);
			return serializeLatexFile(parsed, withoutOrigins(parsed.doc));
		};
		const once = regenerate(src);
		expect(regenerate(once)).toBe(once);
		expect(once.endsWith('the file.\n\n\n')).toBe(true);
	});
});
