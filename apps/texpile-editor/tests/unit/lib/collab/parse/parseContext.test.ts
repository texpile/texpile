import { describe, expect, it } from 'vitest';
import { decodeParseContext, encodeParseContext } from '$lib/collab/parse/parseContext';

const look = { look: 'box', label: 'Rev', color: 'red', font: ['bold'], spellcheck: true } as const;

describe('the parse context a host shares', () => {
	it('reaches a guest as the host sent it', () => {
		const sent = {
			macros: '\\newcommand{\\rev}[1]{}',
			looks: { latex: new Map([['rev', { ...look, font: [...look.font] }]]), typst: new Map() }
		};
		const got = decodeParseContext(encodeParseContext(sent));
		expect(got?.macros).toBe(sent.macros);
		expect([...got!.looks.latex]).toEqual([...sent.looks.latex]);
	});

	it('drops a look a snippet file could not have declared, which would reach the page as a style', () => {
		const raw = JSON.stringify({
			macros: '',
			looks: {
				latex: [
					['rev', { ...look, color: 'red; background: url(x)' }],
					['a"]{}*{x', look],
					['ok', look]
				],
				typst: 'no'
			}
		});
		const got = decodeParseContext(raw);
		expect([...got!.looks.latex.keys()]).toEqual(['ok']);
		expect(got!.looks.typst.size).toBe(0);
		expect(decodeParseContext('not json')).toBeNull();
	});
});
