import { describe, expect, it } from 'vitest';
import { decodeParseContext, encodeParseContext } from '$lib/collab/parse/parseContext';

describe('the parse context a host shares', () => {
	it('reaches a guest as the host sent it', () => {
		const sent = { macros: '\\newcommand{\\rev}[1]{}' };
		expect(decodeParseContext(encodeParseContext(sent))).toEqual(sent);
	});

	it('is dropped when it is not what a host sends', () => {
		expect(decodeParseContext('not json')).toBeNull();
		expect(decodeParseContext(JSON.stringify({ macros: 3 }))).toBeNull();
		expect(decodeParseContext(42)).toBeNull();
	});
});
