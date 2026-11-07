import { describe, expect, it } from 'vitest';
import { readBreak, writeBreak } from '$lib/languages/typst/visual/plugins/pageBreak/breakCall';

describe('breaks', () => {
	it('reads the kind and whether it is weak', () => {
		expect(readBreak('#pagebreak()')).toEqual({ kind: 'page', weak: false });
		expect(readBreak('#pagebreak(weak: true)')).toEqual({ kind: 'page', weak: true });
		expect(readBreak('#pagebreak(to: "odd")')).toEqual({ kind: 'odd', weak: false });
		expect(readBreak('#colbreak()')).toEqual({ kind: 'column', weak: false });
		expect(readBreak('#pagebreak(to: side)')).toBeNull();
		expect(readBreak('#colbreak(to: "odd")')).toBeNull();
	});

	it('writes only what changed', () => {
		expect(writeBreak('#pagebreak()', { kind: 'page', weak: true })).toBe('#pagebreak(weak: true)');
		expect(writeBreak('#pagebreak(weak: true)', { kind: 'page', weak: false })).toBe('#pagebreak()');
		expect(writeBreak('#pagebreak(weak: true)', { kind: 'odd', weak: true })).toBe('#pagebreak(weak: true, to: "odd")');
		expect(writeBreak('#pagebreak(to: "odd")', { kind: 'column', weak: false })).toBe('#colbreak()');
		expect(writeBreak('#colbreak(weak: true)', { kind: 'page', weak: true })).toBe('#pagebreak(weak: true)');
	});
});
