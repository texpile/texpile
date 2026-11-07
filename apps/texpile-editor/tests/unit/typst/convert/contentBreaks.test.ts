// a paragraph break in the content of a call makes the call block-level, as Typst lays the content out
import { describe, expect, it } from 'vitest';
import { parseTypstFile, serializeTypstFile } from '$lib/languages/typst/visual/roundtrip';

describe('a call around paragraphs', () => {
	const src = '#text(11pt, weight: "bold")[\nOne.\n\nTwo.\n]\n';

	it('is an environment of two paragraphs and saves as the file had it', () => {
		const parsed = parseTypstFile(src);
		const env = parsed.doc.child(0);
		expect(env.type.name).toBe('typ_env');
		expect(env.attrs).toMatchObject({ name: 'text', args: '11pt, weight: "bold"' });
		expect(env.childCount).toBe(2);
		expect(serializeTypstFile(parsed, parsed.doc)).toBe(src);
	});

	it('stays in its paragraph when its content is words', () => {
		expect(parseTypstFile('See #text(red)[this] now.\n').doc.child(0).type.name).toBe('paragraph');
	});
});
