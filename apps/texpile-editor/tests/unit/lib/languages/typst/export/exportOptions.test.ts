// The export dialog's options: what they accept, what they refuse before tinymist ever sees them,
// and what the folder remembers of them.
import { describe, expect, it } from 'vitest';
import {
	DEFAULT_EXPORT_OPTIONS,
	exportDestination,
	exportProblems,
	memoryLastDir,
	memoryToOptions,
	optionsToMemory,
	parsePageRanges,
	pdfStandardsFor,
	singlePage,
	tagsRequired,
	uaConflicts
} from '$lib/languages/typst/export/exportOptions';
import type { TypstExportOptions } from '$lib/languages/typst/export/exportOptions.types';

function opts(patch: Partial<TypstExportOptions>): TypstExportOptions {
	return { ...DEFAULT_EXPORT_OPTIONS, ...patch };
}

describe('page ranges', () => {
	it('reads every form tinymist takes, normalized', () => {
		expect(parsePageRanges('')).toEqual([]);
		expect(parsePageRanges('  ')).toEqual([]);
		expect(parsePageRanges('1-3, 5, 8-')).toEqual(['1-3', '5', '8-']);
		expect(parsePageRanges('-2')).toEqual(['-2']);
		expect(parsePageRanges(' 04 - 06 ')).toEqual(['4-6']);
	});

	it('takes the dashes a word processor writes', () => {
		expect(parsePageRanges('3–5, 7—')).toEqual(['3-5', '7-']);
	});

	it('refuses what tinymist would refuse', () => {
		for (const bad of ['0', '0-3', '5-2', '-', '1-2-3', 'a', '1,,2', '1;2', '2.5']) expect(parsePageRanges(bad)).toBeNull();
	});

	it('knows when the ranges name a single page', () => {
		expect(singlePage(['4'])).toBe(true);
		expect(singlePage(['4-4'])).toBe(true);
		expect(singlePage(['4-5'])).toBe(false);
		expect(singlePage(['4-'])).toBe(false);
		expect(singlePage(['1', '2'])).toBe(false);
		expect(singlePage([])).toBe(false);
	});
});

describe('PDF standards', () => {
	it('asks for the chosen standard and PDF/UA-1 in tinymist spelling', () => {
		expect(pdfStandardsFor(opts({}))).toEqual([]);
		expect(pdfStandardsFor(opts({ pdfStandard: 'a-2b', pdfUa: true }))).toEqual(['a-2b', 'ua-1']);
	});

	it('marks tags as required for level A and for PDF/UA', () => {
		expect(tagsRequired(opts({ pdfStandard: 'a-2a' }))).toBe(true);
		expect(tagsRequired(opts({ pdfStandard: 'a-2b' }))).toBe(false);
		expect(tagsRequired(opts({ pdfUa: true }))).toBe(true);
	});

	// measured: tinymist answers "PDF 2.0 is not compatible with PDF/UA-1" and "PDF/A-4 and PDF/UA-1
	// are mutually incompatible"; PDF/A-1b, 2b and 1.4 all take PDF/UA-1
	it('refuses PDF/UA-1 beside PDF 2.0 and PDF/A-4, and only there', () => {
		for (const pdfStandard of ['2.0', 'a-4', 'a-4f', 'a-4e'] as const) expect(uaConflicts(opts({ pdfStandard, pdfUa: true }))).toBe(true);
		for (const pdfStandard of ['', '1.4', 'a-1b', 'a-2b', 'a-3u'] as const)
			expect(uaConflicts(opts({ pdfStandard, pdfUa: true }))).toBe(false);
		expect(uaConflicts(opts({ pdfStandard: '2.0' }))).toBe(false);
	});
});

describe('problems', () => {
	it('has none for the defaults', () => {
		expect(exportProblems(DEFAULT_EXPORT_OPTIONS)).toEqual([]);
	});

	it('flags a bad page range, except for HTML which has no pages', () => {
		expect(exportProblems(opts({ pages: '3-1' }))).toEqual(['pages']);
		expect(exportProblems(opts({ format: 'html', pages: '3-1' }))).toEqual([]);
	});

	it('flags a resolution out of range, for PNG only', () => {
		for (const ppi of [0, -3, 1201, Number.NaN]) expect(exportProblems(opts({ format: 'png', ppi }))).toEqual(['ppi']);
		expect(exportProblems(opts({ format: 'png', ppi: 600 }))).toEqual([]);
		expect(exportProblems(opts({ format: 'svg', ppi: 0 }))).toEqual([]);
	});

	it('flags a fill tinymist cannot parse, for a merged PNG only', () => {
		expect(exportProblems(opts({ format: 'png', merge: true, fill: 'rgb(1,2,3)' }))).toEqual(['fill']);
		expect(exportProblems(opts({ format: 'png', merge: true, fill: '#FFaa00' }))).toEqual([]);
		expect(exportProblems(opts({ format: 'png', merge: false, fill: 'rgb(1,2,3)' }))).toEqual([]);
	});

	it('flags PDF/UA-1 against a standard it cannot combine with', () => {
		expect(exportProblems(opts({ pdfStandard: 'a-4', pdfUa: true }))).toEqual(['ua-version']);
	});
});

describe('destination', () => {
	it('is one file for PDF, HTML and a merged image', () => {
		expect(exportDestination(opts({ format: 'pdf' }))).toBe('file');
		expect(exportDestination(opts({ format: 'html' }))).toBe('file');
		expect(exportDestination(opts({ format: 'png', merge: true }))).toBe('file');
		expect(exportDestination(opts({ format: 'svg', merge: true }))).toBe('file');
	});

	it('is a folder for one image per page, unless only one page is exported', () => {
		expect(exportDestination(opts({ format: 'png' }))).toBe('folder');
		expect(exportDestination(opts({ format: 'svg', pages: '2-4' }))).toBe('folder');
		expect(exportDestination(opts({ format: 'png', pages: '3' }))).toBe('file');
	});
});

describe('memory', () => {
	it('round-trips everything but the page range', () => {
		const chosen = opts({ format: 'png', pages: '1-2', ppi: 300, merge: true, fill: '#102030', pdfStandard: 'a-3b', pdfTagged: false });
		const stored = optionsToMemory(chosen, '/out');
		expect(stored).not.toHaveProperty('pages');
		expect(memoryLastDir(stored)).toBe('/out');
		expect(memoryToOptions(JSON.parse(JSON.stringify(stored)))).toEqual({ ...chosen, pages: '' });
	});

	it('falls back field by field on whatever storage holds', () => {
		expect(memoryToOptions(null)).toEqual(DEFAULT_EXPORT_OPTIONS);
		expect(memoryToOptions('pdf')).toEqual(DEFAULT_EXPORT_OPTIONS);
		expect(
			memoryToOptions({ format: 'docx', ppi: 99999, pdfStandard: 'a-9z', fill: 'red', merge: 'yes', pdfUa: true, pages: '1' })
		).toEqual({ ...DEFAULT_EXPORT_OPTIONS, pdfUa: true });
		expect(memoryLastDir({ lastDir: 42 })).toBeNull();
		expect(memoryLastDir(undefined)).toBeNull();
	});
});
