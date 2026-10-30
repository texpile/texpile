import { describe, expect, it } from 'vitest';
import { hasTypstMarkup } from '$lib/languages/typst/visual/pasteMarkup';

describe('pasted text read as Typst', () => {
	it('takes code, headings, lists, raw blocks and strong text', () => {
		for (const text of ['#emph[x]', '= Title', '- item', '+ step', '```\ncode\n```', 'a *bold* word'])
			expect(hasTypstMarkup(text)).toBe(true);
	});

	it('leaves words with a # or a star in them as words', () => {
		for (const text of ['issue #123 fixed', 'C# and F#', '1. one\n2. two', 'a * b * c']) expect(hasTypstMarkup(text)).toBe(false);
	});
});
