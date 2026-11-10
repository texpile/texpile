import { describe, it, expect } from 'vitest';
import { parseRecords, pageIsRtl } from '$lib/draft/records/pageRecords';

describe('parseRecords', () => {
	it('reads a well-formed page', () => {
		const { records, dropped } = parseRecords('{"t":"g","c":65}\n{"t":"line","n":1}');
		expect(records).toEqual([
			{ t: 'g', c: 65 },
			{ t: 'line', n: 1 }
		]);
		expect(dropped).toBe(0);
	});

	it('ignores blank lines rather than counting them as damage', () => {
		expect(parseRecords('\n{"t":"g","c":65}\n\n')).toEqual({ records: [{ t: 'g', c: 65 }], dropped: 0 });
	});

	it('drops only the bad record and keeps the rest of the page', () => {
		// verbatim what the walker used to emit for \setmainfont{Times New Roman}: luaotfload
		// quotes the name it reports when the family has a space, and it went in unescaped. This
		// exact line threw out of the render and left the page blank.
		const bad = '{"t":"font","id":40,"size":10.0000,"name":""name:Times New Roman:mode=harf;"","file":"x.ttf"}';
		const { records, dropped } = parseRecords(`{"t":"g","c":65}\n${bad}\n{"t":"g","c":66}`);
		expect(dropped).toBe(1);
		expect(records.map((r) => r.c)).toEqual([65, 66]);
	});

	it('survives a page that is nothing but damage', () => {
		expect(parseRecords('}{\nnot json')).toEqual({ records: [], dropped: 2 });
	});
});

describe('pageIsRtl', () => {
	it('is false for a page with no certification reasons', () => {
		expect(pageIsRtl(undefined)).toBe(false);
		expect(pageIsRtl('')).toBe(false);
	});

	it('is true when the walker reported dir', () => {
		expect(pageIsRtl('dir')).toBe(true);
		expect(pageIsRtl('literal,dir')).toBe(true);
		expect(pageIsRtl('dir,escape')).toBe(true);
	});

	it('leaves the region-level reasons alone: those already crop to pixels inside the walk', () => {
		expect(pageIsRtl('literal')).toBe(false);
		expect(pageIsRtl('transform,escape')).toBe(false);
	});

	it('matches whole reasons only', () => {
		expect(pageIsRtl('direction')).toBe(false);
	});
});
