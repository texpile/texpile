// What a paste into a source file can become besides its plain text. Only a paste whose intent is
// clear converts on its own: a spreadsheet range becomes a table, and a URL pasted over selected
// words becomes a link. Formatting from a web page or a document is offered, never applied, and so is
// a table for tab-separated text with no HTML, which is as often a data file's columns as a spreadsheet.
import { typStr } from '$lib/languages/typst/visual/serialize/typstInline';
import type { PasteDialect } from '$lib/editor/paste/pastedImages';

export type SourceClipboard = { html: string; text: string };

/** plain is always there; the first kind a paste can take is what Ctrl+V writes */
export type SourcePasteKind = 'table' | 'link' | 'plain' | 'language';

const PASTED_URL = /^(https?:\/\/|mailto:)\S+$/i;
const NOT_CONTENT = 'style, script, meta, title';

/** the one table a spreadsheet copies, with nothing else around it but its styles */
function isSpreadsheetHtml(html: string): boolean {
	const body = new DOMParser().parseFromString(html, 'text/html').body;
	const tables = body.querySelectorAll('table');
	if (tables.length !== 1 || tables[0].querySelector('table') || tables[0].querySelectorAll('td, th').length < 2) return false;
	for (const skipped of body.querySelectorAll(NOT_CONTENT)) skipped.remove();
	tables[0].remove();
	return !body.textContent!.trim();
}

/** tab-separated lines of one width, at least two rows of two cells; null for any other text */
export function tabSeparatedRows(text: string): string[][] | null {
	const rows = text
		.replace(/\r\n?/g, '\n')
		.replace(/\n$/, '')
		.split('\n')
		.map((line) => line.split('\t'));
	const width = rows[0].length;
	// every line starting on a tab is indented code, not a first column left empty
	const indented = rows.every((row) => row[0] === '');
	return rows.length >= 2 && width >= 2 && !indented && rows.every((row) => row.length === width) ? rows : null;
}

/** true when the clipboard holds a spreadsheet range: its one HTML table, which every spreadsheet puts there */
export function isSpreadsheet(clip: SourceClipboard): boolean {
	return !!clip.html && isSpreadsheetHtml(clip.html);
}

export function pastedUrl(text: string): string | null {
	const trimmed = text.trim();
	return PASTED_URL.test(trimmed) ? trimmed : null;
}

/** `label` linked to `url` in the file's language */
export function linkSource(url: string, label: string, dialect: PasteDialect): string {
	// a backslash or brace would end the argument, so it goes percent-encoded; `%` and `#` escaped survive in another command's argument too
	if (dialect === 'latex') return `\\href{${url.replace(/[\\{}]/g, encodeURIComponent).replace(/[%#]/g, '\\$&')}}{${label}}`;
	if (dialect === 'typst') return `#link(${typStr(url)})[${label}]`;
	return `[${label}](${url})`;
}

/**
 * The kinds this paste can take, the one Ctrl+V writes first. `language` (the clipboard's formatting
 * in the file's language) is a candidate only: whether it says more than the plain text is known
 * once it is converted.
 */
export function sourcePasteKinds(clip: SourceClipboard, selected: string, mayBeFormatted: boolean): SourcePasteKind[] {
	const url = pastedUrl(clip.text);
	if (url && selected && !selected.includes('\n') && !pastedUrl(selected)) return ['link', 'plain'];
	if (isSpreadsheet(clip)) return ['table', 'plain'];
	if (!clip.html && tabSeparatedRows(clip.text)) return ['plain', 'table'];
	return mayBeFormatted ? ['plain', 'language'] : ['plain'];
}
