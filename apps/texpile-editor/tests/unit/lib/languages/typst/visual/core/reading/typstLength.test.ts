import { describe, expect, it } from 'vitest';
import { isTypstLength } from '$lib/languages/typst/visual/core/reading/typstLength';

describe('isTypstLength', () => {
	it('takes only lengths Typst reads', () => {
		for (const length of ['1em', '2.5cm', '10mm', '1in', '12pt', '50%', '1fr', '1em + 2pt', '-3mm', '.5em'])
			expect(isTypstLength(length)).toBe(true);
		for (const text of ['', '1', '1e', '1em +', 'x', '1px', '1em) + #v(1em', '1em\n']) expect(isTypstLength(text)).toBe(false);
	});
});
