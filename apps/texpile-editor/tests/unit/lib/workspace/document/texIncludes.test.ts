import { describe, expect, it } from 'vitest';
import { texIncludesIn } from '$lib/workspace/document/texIncludes';

describe('texIncludesIn', () => {
	it('reads the files TeX loads and leaves listings and \\includeonly out', () => {
		const code = '\\import*{parts/}{a} \\input b \\lstinputlisting{c.py} \\verbatiminput{d} \\includeonly{e} \\inputminted{c}{f.c}';
		expect(texIncludesIn(code).map((i) => [i.name, i.under])).toEqual([
			['a', 'parts/'],
			['b', '']
		]);
	});
});
