// Paste in the source editor. Plain text stays the default; a spreadsheet range becomes a table and a
// URL over selected words a link, a picture is saved into the project, and a paste that could have
// gone another way leaves the Paste As button. Smart Paste off leaves CodeMirror's own paste.
import { EditorView as CMView, keymap } from '@codemirror/view';
import { Facet, type EditorState, type Extension } from '@codemirror/state';
import { syntaxTree } from '@codemirror/language';
import type { SyntaxNode } from '@lezer/common';
import { settings } from '$lib/settings';
import { m } from '$lib/paraglide/messages';
import { pasteAtCursor } from '$lib/editor/source/cmClipboardUtils';
import { looksLikeMarkdown } from '$lib/editor/paste/markdownPaste';
import type { PasteDialect } from '$lib/editor/paste/pastedImages';
import { formattedSource, tableSource } from './sourcePasteConvert';
import { linkSource, pastedUrl, sourcePasteKinds, type SourceClipboard, type SourcePasteKind } from './sourcePasteOptions';
import { choosePasteReading, pasteAsWidget, setOpenPaste, showPasteReadings, type OpenPaste, type PasteReading } from './cmPasteAsWidget';
import { clipboardImage, pasteImageFile } from './sourcePasteImage';
import { offerPackageFor } from '$lib/languages/latex/symbols/latexSymbolPackage';
import { isMathContext } from '$lib/languages/latex/intellisense/completion/mathContext';
import { typstInsertContextAt } from '$lib/languages/typst/symbols/typstSymbolInsert';

export type SourcePasteSetup = {
	dialect: PasteDialect;
	imageDir: () => string | null;
	/** in a shared session, ends the undo step Yjs is gathering, which the next edit would join */
	stopUndoCapture?: () => void;
};

const LANGUAGE_NAMES: Record<PasteDialect, string> = { latex: 'LaTeX', typst: 'Typst', markdown: 'Markdown' };
const MARKDOWN_CODE = new Set(['FencedCode', 'CodeBlock', 'InlineCode']);
const LATEX_VERBATIM = /\\(begin|end)\s*\{(?:verbatim|Verbatim|lstlisting|minted|alltt|filecontents)\*?\}/g;
const LATEX_WINDOW = 4000;
// the URL slot of a link, which Insert > Link leaves selected for the paste
const LINK_DESTINATION = /(?:\\(?:href|url)\{|\]\()$/;
const HYPERREF = { command: '\\href', package: 'hyperref', fontenc: '' };

const sourcePasteSetup = Facet.define<SourcePasteSetup, SourcePasteSetup | null>({ combine: (values) => values[0] ?? null });

/** true when the editor converts pastes: a LaTeX, Typst or Markdown file */
export function hasSourcePaste(state: EditorState): boolean {
	return state.facet(sourcePasteSetup) !== null;
}

function readingLabel(kind: SourcePasteKind, dialect: PasteDialect): string {
	switch (kind) {
		case 'plain':
			return m.paste_as_plain();
		case 'table':
			return m.paste_as_table();
		case 'link':
			return m.paste_as_link();
		case 'language':
			return m.paste_as_language({ language: LANGUAGE_NAMES[dialect] });
	}
}

function plainText(clip: SourceClipboard): string {
	return clip.text || new DOMParser().parseFromString(clip.html, 'text/html').body.textContent || '';
}

function readingText(kind: SourcePasteKind, clip: SourceClipboard, selected: string, dialect: PasteDialect): string | null {
	switch (kind) {
		case 'plain':
			return plainText(clip);
		case 'link':
			return linkSource(pastedUrl(clip.text)!, selected, dialect);
		case 'table':
			return tableSource(clip, dialect);
		case 'language': {
			const text = formattedSource(clip, dialect);
			return text && text.trim() !== plainText(clip).trim() ? text : null;
		}
	}
}

/** each kind as the text it writes over `selected`, in the order given; a kind that says nothing new drops out */
function readingsOf(kinds: SourcePasteKind[], clip: SourceClipboard, selected: string, dialect: PasteDialect): PasteReading[] {
	return kinds.flatMap((kind) => {
		const text = readingText(kind, clip, selected, dialect)?.replace(/\r\n?/g, '\n');
		if (text == null) return [];
		const linked = dialect === 'latex' && text.includes('\\href{');
		return [{ kind, label: readingLabel(kind, dialect), text, written: linked ? () => offerPackageFor(HYPERREF) : undefined }];
	});
}

// LaTeX's highlighter is a line tokenizer, whose tree has no environments to ask
function inLatexVerbatim(state: EditorState, pos: number): boolean {
	let open = false;
	for (const [, edge] of state.sliceDoc(Math.max(0, pos - LATEX_WINDOW), pos).matchAll(LATEX_VERBATIM)) open = edge === 'begin';
	return open;
}

function inMarkdownCode(state: EditorState, pos: number): boolean {
	for (let node: SyntaxNode | null = syntaxTree(state).resolveInner(pos, -1); node; node = node.parent)
		if (MARKDOWN_CODE.has(node.name) && node.from < pos && pos < node.to) return true;
	return false;
}

/** true in code, verbatim or math, where a paste goes in as written */
function takenAsWritten(state: EditorState, pos: number, dialect: PasteDialect): boolean {
	if (dialect === 'typst') return typstInsertContextAt(state, pos) !== 'markup';
	if (dialect === 'latex') return isMathContext(state, pos) || inLatexVerbatim(state, pos);
	return inMarkdownCode(state, pos);
}

function kindsAt(state: EditorState, clip: SourceClipboard, dialect: PasteDialect): SourcePasteKind[] {
	const { from, to } = state.selection.main;
	if (takenAsWritten(state, from, dialect) || takenAsWritten(state, to, dialect)) return ['plain'];
	if (LINK_DESTINATION.test(state.sliceDoc(Math.max(0, from - 6), from))) return ['plain'];
	const formatted = !!clip.html || (dialect !== 'markdown' && looksLikeMarkdown(clip.text, dialect));
	return sourcePasteKinds(clip, state.sliceDoc(from, to), formatted);
}

// a table or link Ctrl+V made goes in over the plain text, so when it read the paste wrong one undo leaves the text
function insertReading(view: CMView, readings: PasteReading[], chosen: PasteReading, setup: SourcePasteSetup): OpenPaste {
	const { from, to } = view.state.selection.main;
	const plain = readings.find((reading) => reading.kind === 'plain');
	let paste: OpenPaste = { from, to, readings, current: null };
	if (plain && plain !== chosen) {
		choosePasteReading(view, paste, plain);
		setup.stopUndoCapture?.();
		paste = { ...paste, to: from + plain.text.length, current: 'plain' };
	}
	choosePasteReading(view, paste, chosen);
	return { from, to: from + chosen.text.length, readings, current: chosen.kind };
}

// converting a web page's HTML can take a moment, so the plain text goes in first and the offer follows
function offerFormatted(view: CMView, paste: OpenPaste, clip: SourceClipboard, selected: string, dialect: PasteDialect): void {
	const doc = view.state.doc;
	setTimeout(() => {
		const { head } = view.state.selection.main;
		if (view.state.doc !== doc || head < paste.from || head > paste.to) return;
		const offered = readingsOf(['language'], clip, selected, dialect);
		if (offered.length) view.dispatch({ effects: setOpenPaste.of({ ...paste, readings: [...paste.readings, ...offered] }) });
	});
}

/** false when the paste is plain text with nothing else to offer, which CodeMirror pastes itself */
function pasteClipboard(view: CMView, clip: SourceClipboard, setup: SourcePasteSetup): boolean {
	const { dialect } = setup;
	const { from, to } = view.state.selection.main;
	const selected = view.state.sliceDoc(from, to);
	const kinds = kindsAt(view.state, clip, dialect);
	const readings = readingsOf(
		kinds.filter((kind) => kind !== 'language'),
		clip,
		selected,
		dialect
	);
	if (kinds.length === 1 || !readings.length) return false;
	const paste = insertReading(view, readings, readings[0], setup);
	if (kinds.includes('language')) offerFormatted(view, paste, clip, selected, dialect);
	return true;
}

async function readClipboard(): Promise<{ clip: SourceClipboard; image: File | null }> {
	const read = { clip: { html: '', text: '' }, image: null as File | null };
	for (const item of await navigator.clipboard.read()) {
		if (!read.clip.html && item.types.includes('text/html')) read.clip.html = await (await item.getType('text/html')).text();
		if (!read.clip.text && item.types.includes('text/plain')) read.clip.text = await (await item.getType('text/plain')).text();
		const type = item.types.find((t) => t.startsWith('image/'));
		if (type && !read.image) read.image = new File([await item.getType(type)], `pasted.${type.split('/')[1]}`, { type });
	}
	return read;
}

/** the right-click menu's Paste: the clipboard as Ctrl+V pastes it */
export async function pasteIntoSource(view: CMView): Promise<void> {
	const setup = view.state.facet(sourcePasteSetup);
	if (!setup) return pasteAtCursor(view);
	const read = await readClipboard().catch(() => null);
	const dir = setup.imageDir();
	if (read?.image && !read.clip.text && dir) await pasteImageFile(view, read.image, setup.dialect, dir);
	else if (read?.clip.text && !(settings.current.smartPaste !== false && pasteClipboard(view, read.clip, setup)))
		view.dispatch({ ...view.state.replaceSelection(read.clip.text), userEvent: 'input.paste', scrollIntoView: true });
	view.focus();
}

/** Paste As… from the palette: every reading of the clipboard, chosen from a menu at the caret */
export async function showPasteAsMenu(view: CMView): Promise<void> {
	const setup = view.state.facet(sourcePasteSetup);
	const read = await readClipboard().catch(() => null);
	if (!setup || !read || (!read.clip.text && !read.clip.html)) return;
	const { from, to, head } = view.state.selection.main;
	const readings = readingsOf(kindsAt(view.state, read.clip, setup.dialect), read.clip, view.state.sliceDoc(from, to), setup.dialect);
	const at = view.coordsAtPos(head);
	if (at) showPasteReadings(view, { from, to, readings, current: null }, { x: at.left, y: at.bottom + 2 });
}

function handlePaste(event: ClipboardEvent, view: CMView): boolean {
	const setup = view.state.facet(sourcePasteSetup);
	const clipboard = event.clipboardData;
	if (!setup || !clipboard || view.state.readOnly) return false;
	const image = clipboardImage(clipboard);
	const dir = setup.imageDir();
	if (image && dir) {
		event.preventDefault();
		void pasteImageFile(view, image, setup.dialect, dir);
		return true;
	}
	// several carets keep CodeMirror's paste, which gives each caret its own line
	if (settings.current.smartPaste === false || view.state.selection.ranges.length > 1) return false;
	const clip = { html: clipboard.getData('text/html'), text: clipboard.getData('text/plain') };
	if (!clip.html && !clip.text) return false;
	if (!pasteClipboard(view, clip, setup)) return false;
	event.preventDefault();
	return true;
}

export function sourcePaste(setup: SourcePasteSetup): Extension {
	return [
		sourcePasteSetup.of(setup),
		pasteAsWidget(),
		CMView.domEventHandlers({ paste: handlePaste }),
		keymap.of([
			{
				key: 'Mod-Shift-v',
				run(view) {
					if (view.state.readOnly) return false;
					void pasteAtCursor(view);
					return true;
				}
			}
		])
	];
}
