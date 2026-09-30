// The tinymist command an export runs and where it writes. Shapes checked against tinymist 0.15:
// crates/tinymist/src/cmd/export.rs takes [entry, options, action], and every command writes to
// the server's `outputPath` pattern with the format's extension ADDED (report.v2 -> report.v2.pdf).
import { basename, joinPath } from '$lib/workspace/fileSystem';
import { exportDestination, parsePageRanges, pdfStandardsFor, tagsRequired } from './exportOptions';
import type { TypstExportOptions } from './exportOptions.types';

/** what requestTypstExport sends */
export type TypstExportJob = {
	command: string;
	arguments: unknown[];
	/** tinymist's outputPath for this one export: the destination without its extension */
	outputPath: string;
};

export type OutputPathResult = { ok: true; outputPath: string } | { ok: false; token: string };

const COMMANDS = {
	pdf: 'tinymist.exportPdf',
	png: 'tinymist.exportPng',
	svg: 'tinymist.exportSvg',
	html: 'tinymist.exportHtml'
} as const;

// tinymist substitutes these in any outputPath, so a folder that happens to be called $name or
// {p} would be rewritten into somewhere else; the page ones are only honored in paged exports,
// but refusing them everywhere is simpler than explaining when they count
const PATTERN_TOKENS = ['$root', '$dir', '$name', '{p}', '{0p}', '{n}', '{t}'];

/** the page template for one file per page: thesis-1.png, or thesis-01.png once there are ten */
const PAGE_TEMPLATE = '{0p}';

/** the options tinymist's own structs read (camelCase, see ExportPdfOpts / ExportPngOpts / ExportSvgOpts) */
function commandOptions(options: TypstExportOptions): Record<string, unknown> {
	const ranges = parsePageRanges(options.pages) ?? [];
	const pages = ranges.length ? { pages: ranges } : {};
	switch (options.format) {
		case 'pdf':
			// explicit even when empty: left out, tinymist falls back to whatever typstExtraArgs holds
			return { ...pages, pdfStandard: pdfStandardsFor(options), noPdfTags: !options.pdfTagged && !tagsRequired(options) };
		case 'png':
			// fill only ever reaches the merged canvas: tinymist renders a lone page on its own ground
			return {
				...pages,
				ppi: options.ppi,
				...(options.merge ? { merge: {} } : {}),
				...(options.merge && options.fill ? { fill: options.fill } : {})
			};
		case 'svg':
			return { ...pages, ...(options.merge ? { merge: {} } : {}) };
		default:
			return {};
	}
}

export function exportCommandFor(options: TypstExportOptions, main: string): { command: string; arguments: unknown[] } {
	return { command: COMMANDS[options.format], arguments: [main, commandOptions(options)] };
}

function withoutExtension(path: string, extension: string): string {
	return path.toLowerCase().endsWith(`.${extension}`) ? path.slice(0, -(extension.length + 1)) : path;
}

/** the main file's name as the files are named: thesis.typ -> thesis */
export function exportStem(main: string): string {
	return basename(main).replace(/\.typ$/i, '') || 'document';
}

/**
 * tinymist's outputPath for a destination the user picked: the saved file less its extension (tinymist
 * adds it back), or the folder plus `<main>-{0p}`, which tinymist numbers page by page.
 */
export function outputPathFor(options: TypstExportOptions, destination: string, main: string): OutputPathResult {
	const token = PATTERN_TOKENS.find((t) => destination.includes(t));
	if (token) return { ok: false, token };
	const outputPath =
		exportDestination(options) === 'folder'
			? joinPath(destination, `${exportStem(main)}-${PAGE_TEMPLATE}`)
			: withoutExtension(destination, options.format);
	return { ok: true, outputPath };
}
