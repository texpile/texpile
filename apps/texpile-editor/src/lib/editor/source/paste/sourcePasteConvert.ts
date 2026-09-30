// A paste's HTML or Markdown as the source it reads as: parsed into the visual editor of the file's
// language and written by its serializer, so it reads as a copy from that editor would.
import { DOMParser as PMDOMParser, type Node as PMNode, type Schema, type Slice } from 'prosemirror-model';
import { schema as latexSchema } from '$lib/languages/latex/schema/latexPMSchema';
import { typSchema } from '$lib/languages/typst/visual/schema';
import { mdSchema } from '$lib/languages/markdown/visual/schema';
import { sliceToLatex } from '$lib/editor/visual/extensions/latexClipboard';
import { sliceToTypst } from '$lib/languages/typst/visual/clipboard';
import { sliceToMarkdown } from '$lib/languages/markdown/visual/clipboard';
import { cleanPastedHtml } from '$lib/editor/paste/pastedHtmlCleanup';
import { looksLikeMarkdown, markdownSlice } from '$lib/editor/paste/markdownPaste';
import { sliceWithKeptImages, type PasteDialect } from '$lib/editor/paste/pastedImages';
import { tabSeparatedRows, type SourceClipboard } from './sourcePasteOptions';

const LANGUAGES: Record<PasteDialect, { schema: Schema; write: (slice: Slice) => string }> = {
	latex: { schema: latexSchema, write: sliceToLatex },
	typst: { schema: typSchema, write: sliceToTypst },
	markdown: { schema: mdSchema, write: sliceToMarkdown }
};
// what plain text parses to: anything else is formatting the plain paste would lose
const PLAIN_NODES = new Set(['paragraph', 'text', 'hard_break', 'code_block']);

// a pipe table cannot go without a header, and a spreadsheet names none
function promoteHeaderRows(body: HTMLElement): void {
	for (const table of body.querySelectorAll('table')) {
		if (table.querySelector('th')) continue;
		for (const td of table.querySelector('tr')?.querySelectorAll(':scope > td') ?? []) {
			const th = body.ownerDocument.createElement('th');
			th.append(...td.childNodes);
			td.replaceWith(th);
		}
	}
}

function htmlSlice(html: string, dialect: PasteDialect): Slice {
	const body = new DOMParser().parseFromString(cleanPastedHtml(html), 'text/html').body;
	if (dialect === 'markdown') promoteHeaderRows(body);
	return PMDOMParser.fromSchema(LANGUAGES[dialect].schema).parseSlice(body);
}

function tableCellHtml(text: string): string {
	return `<td>${text.replace(/&/g, '&amp;').replace(/</g, '&lt;')}</td>`;
}

function tableHtml(rows: string[][]): string {
	return `<table>${rows.map((row) => `<tr>${row.map(tableCellHtml).join('')}</tr>`).join('')}</table>`;
}

function isFormatted(slice: Slice): boolean {
	let found = false;
	slice.content.descendants((node: PMNode) => {
		if (!PLAIN_NODES.has(node.type.name) || node.marks.length) found = true;
		return !found;
	});
	return found;
}

function written(slice: Slice, dialect: PasteDialect): string {
	// a source paste has no place to save a picture the clipboard holds, and no editor to show it
	return LANGUAGES[dialect].write(sliceWithKeptImages(slice, dialect, false));
}

/** the spreadsheet range on the clipboard as a table in the file's language */
export function tableSource(clip: SourceClipboard, dialect: PasteDialect): string {
	const rows = clip.html ? null : tabSeparatedRows(clip.text);
	return written(htmlSlice(rows ? tableHtml(rows) : clip.html, dialect), dialect);
}

/** the clipboard's formatting in the file's language, or null when it has none the plain text lacks */
export function formattedSource(clip: SourceClipboard, dialect: PasteDialect): string | null {
	const markdown = !clip.html && dialect !== 'markdown' && looksLikeMarkdown(clip.text, dialect);
	const slice = clip.html ? htmlSlice(clip.html, dialect) : markdown ? markdownSlice(clip.text, LANGUAGES[dialect].schema) : null;
	return slice && isFormatted(slice) ? written(slice, dialect) : null;
}
