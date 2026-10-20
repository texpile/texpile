import { describe, expect, it } from 'vitest';
import { decodeParseContext, encodeParseContext } from '$lib/collab/parse/parseContext';

describe('the parse context a host shares', () => {
	it('reaches a guest as the host sent it', () => {
		const sent = { macros: '\\newcommand{\\rev}[1]{}', engine: 'pdflatex' as const };
		expect(decodeParseContext(encodeParseContext(sent))).toEqual(sent);
		// a host from before the engine was shared
		expect(decodeParseContext(JSON.stringify({ macros: '' }))).toEqual({ macros: '', engine: null });
	});

	it('is dropped when it is not what a host sends', () => {
		expect(decodeParseContext('not json')).toBeNull();
		expect(decodeParseContext(JSON.stringify({ macros: 3 }))).toBeNull();
		expect(decodeParseContext(42)).toBeNull();
	});
});
