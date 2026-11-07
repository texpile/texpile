import { describe, it, expect } from 'vitest';
import { gen, regen, blockTypes, roundtrip } from './mdTestUtils';

describe('block constructs', () => {
	// M13
	it('a fence whose info string holds a backtick is a tilde fence', () => {
		const src = '~~~ a`b\ncode\n~~~\n';
		expect(gen(src)).toBe('~~~a`b\ncode\n~~~');
		expect(regen(src)).toBe(gen(src));
		expect(blockTypes(gen(src))).toEqual(['code_block']);
	});

	// M17
	it('a $$ block ends at a blank line and never at another opener', () => {
		const src = '$$\nx\n$$ trailing\n\npara\n\n$$\ny\n$$\n';
		expect(blockTypes(src)).toEqual(['paragraph', 'paragraph', 'block_math']);
		expect(gen(src)).toBe('\\$\\$ x \\$\\$ trailing\n\npara\n\n$$\ny\n$$');
		expect(blockTypes('text\n$$5 and $$6 prices\nmore\n')).toEqual(['paragraph']);
	});

	it('a fence of one blank line holds nothing, and of two holds a line break', () => {
		expect(gen('```\n\n```\n')).toBe('```\n\n```');
		expect(gen('```\n\n\n```\n')).toBe('```\n\n\n```');
	});

	it('a tag that closes itself alone on its line is raw HTML that survives', () => {
		expect(blockTypes('before\n\n<br/>\n\nafter\n')).toEqual(['paragraph', 'raw_latex', 'paragraph']);
		expect(gen('before\n\n<br/>\n\nafter\n')).toBe('before\n\n<br/>\n\nafter');
	});

	it('a table whose rows end in spaces is a table', () => {
		expect(blockTypes('| a | b |  \n| --- | --- |  \n| 1 | 2 |  \n')).toEqual(['table']);
	});
});

describe('a fence left open at the end of the file', () => {
	it('saves untouched as written, blank lines and all', () => {
		for (const src of ['para\n\n```\ncode\n\n\n', '```\ncode\n\n']) expect(roundtrip(src)).toBe(src);
	});
});
