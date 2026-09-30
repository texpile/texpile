// What an export sends tinymist. The argument shapes were checked against tinymist 0.15 over a
// real LSP session; these tests keep them from drifting.
import { describe, expect, it } from 'vitest';
import { DEFAULT_EXPORT_OPTIONS } from '$lib/languages/typst/export/exportOptions';
import { exportCommandFor, exportStem, outputPathFor } from '$lib/languages/typst/export/exportCommand';
import type { TypstExportOptions } from '$lib/languages/typst/export/exportOptions.types';

const MAIN = '/proj/thesis.typ';

function opts(patch: Partial<TypstExportOptions>): TypstExportOptions {
	return { ...DEFAULT_EXPORT_OPTIONS, ...patch };
}

describe('the command', () => {
	it('exports a PDF with its standards and tags spelled out', () => {
		expect(exportCommandFor(opts({}), MAIN)).toEqual({
			command: 'tinymist.exportPdf',
			arguments: [MAIN, { pdfStandard: [], noPdfTags: false }]
		});
		expect(exportCommandFor(opts({ pages: '2-3, 7', pdfStandard: 'a-2b', pdfUa: true, pdfTagged: false }), MAIN)).toEqual({
			command: 'tinymist.exportPdf',
			// PDF/UA-1 needs its tags, so switching them off does not reach tinymist
			arguments: [MAIN, { pages: ['2-3', '7'], pdfStandard: ['a-2b', 'ua-1'], noPdfTags: false }]
		});
		expect(exportCommandFor(opts({ pdfTagged: false }), MAIN).arguments[1]).toEqual({ pdfStandard: [], noPdfTags: true });
	});

	it('exports PNG pages at a resolution, and a fill only on the merged canvas', () => {
		expect(exportCommandFor(opts({ format: 'png', ppi: 300, fill: '#ffffff' }), MAIN)).toEqual({
			command: 'tinymist.exportPng',
			arguments: [MAIN, { ppi: 300 }]
		});
		expect(exportCommandFor(opts({ format: 'png', ppi: 72, merge: true, fill: '#ffffff', pages: '1-2' }), MAIN)).toEqual({
			command: 'tinymist.exportPng',
			arguments: [MAIN, { pages: ['1-2'], ppi: 72, merge: {}, fill: '#ffffff' }]
		});
	});

	it('exports SVG merged or per page', () => {
		expect(exportCommandFor(opts({ format: 'svg' }), MAIN)).toEqual({ command: 'tinymist.exportSvg', arguments: [MAIN, {}] });
		expect(exportCommandFor(opts({ format: 'svg', merge: true }), MAIN).arguments[1]).toEqual({ merge: {} });
	});

	it('exports HTML with no options at all, whatever the dialog holds', () => {
		expect(exportCommandFor(opts({ format: 'html', pages: '1', pdfUa: true }), MAIN)).toEqual({
			command: 'tinymist.exportHtml',
			arguments: [MAIN, {}]
		});
	});
});

describe('the output path', () => {
	it('drops the extension tinymist adds back, whatever its case', () => {
		expect(outputPathFor(opts({}), '/out/Final report.pdf', MAIN)).toEqual({ ok: true, outputPath: '/out/Final report' });
		expect(outputPathFor(opts({}), '/out/report.PDF', MAIN)).toEqual({ ok: true, outputPath: '/out/report' });
		// a name typed without one (the Linux dialog adds none) is left as it is, and gets one from tinymist
		expect(outputPathFor(opts({ format: 'html' }), '/out/site', MAIN)).toEqual({ ok: true, outputPath: '/out/site' });
		// only the format's own extension: report.v2 is a name
		expect(outputPathFor(opts({}), '/out/report.v2', MAIN)).toEqual({ ok: true, outputPath: '/out/report.v2' });
	});

	it('numbers the pages inside a picked folder after the main file', () => {
		expect(outputPathFor(opts({ format: 'png' }), '/out/pages', MAIN)).toEqual({ ok: true, outputPath: '/out/pages/thesis-{0p}' });
		expect(outputPathFor(opts({ format: 'svg' }), 'C:\\Users\\me\\pages', 'C:\\docs\\Thesis.typ')).toEqual({
			ok: true,
			outputPath: 'C:\\Users\\me\\pages\\Thesis-{0p}'
		});
	});

	it('refuses a destination tinymist would read placeholders in', () => {
		expect(outputPathFor(opts({}), '/out/$name/report.pdf', MAIN)).toEqual({ ok: false, token: '$name' });
		expect(outputPathFor(opts({ format: 'png' }), '/out/{p}', MAIN)).toEqual({ ok: false, token: '{p}' });
	});

	it('names the files after the main file', () => {
		expect(exportStem('/a/b/Chapter One.typ')).toBe('Chapter One');
		expect(exportStem('/a/b/.typ')).toBe('document');
	});
});
