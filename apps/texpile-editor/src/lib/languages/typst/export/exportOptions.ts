import type { ExportProblem, PdfStandardChoice, TypstExportFormat, TypstExportMemory, TypstExportOptions } from './exportOptions.types';

export const DEFAULT_EXPORT_OPTIONS: TypstExportOptions = {
	format: 'pdf',
	pages: '',
	pdfStandard: '',
	pdfUa: false,
	pdfTagged: true,
	ppi: 144,
	merge: false,
	fill: ''
};

export const EXPORT_FORMATS: readonly TypstExportFormat[] = ['pdf', 'png', 'svg', 'html'];
export const PDF_VERSIONS: readonly PdfStandardChoice[] = ['1.4', '1.5', '1.6', '1.7', '2.0'];
export const PDF_ARCHIVAL: readonly PdfStandardChoice[] = [
	'a-1b',
	'a-1a',
	'a-2b',
	'a-2u',
	'a-2a',
	'a-3b',
	'a-3u',
	'a-3a',
	'a-4',
	'a-4f',
	'a-4e'
];

// 1200 PPI is already a 10k by 14k pixel image of an A4 page; past that a single page can take more
// memory than tinymist has, and it is the language server that falls over
export const MIN_PPI = 1;
export const MAX_PPI = 1200;

const HEX_FILL = /^#[0-9a-f]{6}$/i;

/**
 * Typst's page ranges from what was typed, as tinymist reads them (`1-3`, `5`, `8-`, `-2`), or null
 * when it is not a list of ranges. Empty means every page and comes back as an empty list.
 *
 * Checked here rather than left to tinymist because its answer names its own option struct
 * ("expect ExportPdfOpts at args[1]"), and a dialog can say which field is wrong before anything runs.
 */
export function parsePageRanges(text: string): string[] | null {
	const trimmed = text.trim();
	if (!trimmed) return [];
	const ranges: string[] = [];
	// en and em dashes are what a word processor turns 3-5 into
	for (const part of trimmed.replace(/[–—]/g, '-').split(',')) {
		const range = pageRange(part.trim());
		if (range === null) return null;
		ranges.push(range);
	}
	return ranges;
}

function pageRange(part: string): string | null {
	if (/^\d+$/.test(part)) return Number(part) >= 1 ? String(Number(part)) : null;
	const span = /^(\d*)\s*-\s*(\d*)$/.exec(part);
	if (!span || (!span[1] && !span[2])) return null;
	const start = span[1] ? Number(span[1]) : null;
	const end = span[2] ? Number(span[2]) : null;
	if (start === 0 || end === 0) return null;
	if (start !== null && end !== null && start > end) return null;
	return `${start ?? ''}-${end ?? ''}`;
}

/** the ranges name exactly one page (`4`, `4-4`), so even a per-page export is one file */
export function singlePage(ranges: readonly string[]): boolean {
	if (ranges.length !== 1) return false;
	const span = /^(\d+)(?:-(\d+))?$/.exec(ranges[0]);
	return !!span && (span[2] === undefined || span[1] === span[2]);
}

/** a standard at level A (a-1a, a-2a, a-3a) or PDF/UA-1 writes tags whatever the switch says */
export function tagsRequired(options: TypstExportOptions): boolean {
	return options.pdfUa || /^a-\da$/.test(options.pdfStandard);
}

/** PDF/UA-1 is a PDF 1.7 standard: tinymist refuses it beside PDF 2.0 or any PDF/A-4 */
export function uaConflicts(options: TypstExportOptions): boolean {
	return options.pdfUa && (options.pdfStandard === '2.0' || options.pdfStandard.startsWith('a-4'));
}

/** the standards to ask for, in tinymist's spelling */
export function pdfStandardsFor(options: TypstExportOptions): string[] {
	return [...(options.pdfStandard ? [options.pdfStandard] : []), ...(options.pdfUa ? ['ua-1'] : [])];
}

/** what is wrong with the options for their own format; empty when they can run */
export function exportProblems(options: TypstExportOptions): ExportProblem[] {
	const problems: ExportProblem[] = [];
	if (options.format !== 'html' && parsePageRanges(options.pages) === null) problems.push('pages');
	if (options.format === 'png') {
		if (!Number.isFinite(options.ppi) || options.ppi < MIN_PPI || options.ppi > MAX_PPI) problems.push('ppi');
		if (options.merge && options.fill && !HEX_FILL.test(options.fill)) problems.push('fill');
	}
	if (options.format === 'pdf' && uaConflicts(options)) problems.push('ua-version');
	return problems;
}

/** one file the save dialog names, or one file per page in a folder the user picks */
export function exportDestination(options: TypstExportOptions): 'file' | 'folder' {
	if (options.format === 'pdf' || options.format === 'html' || options.merge) return 'file';
	return singlePage(parsePageRanges(options.pages) ?? []) ? 'file' : 'folder';
}

function oneOf<T>(value: unknown, allowed: readonly T[], fallback: T): T {
	return allowed.find((a) => a === value) ?? fallback;
}

/**
 * Remembered options back from storage, field by field. localStorage is edited by hand and by older
 * builds, so every field that is not the right shape falls back to its default instead of reaching
 * tinymist.
 */
export function memoryToOptions(raw: unknown): TypstExportOptions {
	const stored = (typeof raw === 'object' && raw !== null ? raw : {}) as Partial<Record<keyof TypstExportMemory, unknown>>;
	const defaults = DEFAULT_EXPORT_OPTIONS;
	return {
		format: oneOf(stored.format, EXPORT_FORMATS, defaults.format),
		pages: '',
		pdfStandard: oneOf(stored.pdfStandard, ['', ...PDF_VERSIONS, ...PDF_ARCHIVAL], defaults.pdfStandard),
		pdfUa: typeof stored.pdfUa === 'boolean' ? stored.pdfUa : defaults.pdfUa,
		pdfTagged: typeof stored.pdfTagged === 'boolean' ? stored.pdfTagged : defaults.pdfTagged,
		ppi: typeof stored.ppi === 'number' && stored.ppi >= MIN_PPI && stored.ppi <= MAX_PPI ? stored.ppi : defaults.ppi,
		merge: typeof stored.merge === 'boolean' ? stored.merge : defaults.merge,
		fill: typeof stored.fill === 'string' && (stored.fill === '' || HEX_FILL.test(stored.fill)) ? stored.fill : defaults.fill
	};
}

/** where the folder's last export went, if the stored memory says so */
export function memoryLastDir(raw: unknown): string | null {
	const dir = typeof raw === 'object' && raw !== null ? (raw as { lastDir?: unknown }).lastDir : null;
	return typeof dir === 'string' && dir ? dir : null;
}

/** the page range is left out: it belongs to one export, and a stale one would quietly drop pages from the next */
export function optionsToMemory(options: TypstExportOptions, lastDir: string | undefined): TypstExportMemory {
	const { pages: _pages, ...kept } = options;
	return lastDir ? { ...kept, lastDir } : kept;
}
