// Paste in the visual editors, ahead of each dialect's own source parse: HTML from another app comes
// in as the writing it holds, Markdown text as its formatting, and Mod+Shift+V as plain text. With
// Smart Paste off, what another app put on the clipboard pastes as its plain text; the file's own
// language still parses, as a copy from the source editor needs it to.
import { Plugin } from 'prosemirror-state';
import type { Schema } from 'prosemirror-model';
import type { EditorView } from 'prosemirror-view';
import { keydownHandler } from 'prosemirror-keymap';
import { settings } from '$lib/settings';
import { cleanPastedHtml, isCodeEditorCopy } from './pastedHtmlCleanup';
import { isTexpileCopy, texpileClipboardSerializer } from './texpileCopy';
import { keepSavableImages, leavesOutImages, pastedImageSaving, warnImagesLeftOut, type PasteDialect } from './pastedImages';
import { looksLikeMarkdown, markdownSlice } from './markdownPaste';
import { pasteWithoutFormatting } from './visualClipboardPaste';
import { pasteReadingOfText } from './pasteReadingOfText';

/** reads text in the file's own language into the editor; false when the text is not in it */
export type SourceTextPaste = (view: EditorView, text: string) => boolean;

function pasteMarkdown(view: EditorView, text: string, dialect: PasteDialect): boolean {
	const slice = markdownSlice(text, view.state.schema);
	if (!slice) return false;
	pasteReadingOfText(view, text, keepSavableImages(slice, view, dialect, true));
	if (leavesOutImages(slice, dialect)) warnImagesLeftOut();
	return true;
}

/** the Markdown editor's own language */
export function pasteMarkdownSource(view: EditorView, text: string): boolean {
	return looksLikeMarkdown(text, 'markdown') && pasteMarkdown(view, text, 'markdown');
}

export function visualSmartPaste(dialect: PasteDialect, schema: Schema, pasteSource: SourceTextPaste): Plugin {
	let fromTexpile = false;
	// set by the latest paste's transform, told only once that paste is the one going in
	let leftOut = false;
	return new Plugin({
		...pastedImageSaving(),
		props: {
			clipboardSerializer: texpileClipboardSerializer(schema),
			handleKeyDown: keydownHandler({
				'Mod-Shift-v': (_state, _dispatch, view) => {
					if (view) void pasteWithoutFormatting(view);
					return true;
				}
			}),
			transformPastedHTML(html) {
				fromTexpile = isTexpileCopy(html);
				return fromTexpile ? html : cleanPastedHtml(html);
			},
			transformPasted(slice, view, plain) {
				leftOut = leavesOutImages(slice, dialect);
				return keepSavableImages(slice, view, dialect, !plain && !view.dragging && !fromTexpile);
			},
			handleDrop(_view, _event, _slice, moved) {
				if (leftOut && !moved) warnImagesLeftOut();
				leftOut = false;
				return false;
			},
			handlePaste(view, event) {
				const imagesLeftOut = leftOut;
				leftOut = false;
				const clipboard = event.clipboardData;
				if (!clipboard || view.state.selection.$from.parent.type.spec.code) return false;
				const html = clipboard.getData('text/html');
				const text = clipboard.getData('text/plain');
				const smart = settings.current.smartPaste !== false;
				// a code editor's copy is its text with colors on: in the file's own language, it is read as that
				if (html && text && isCodeEditorCopy(html) && pasteSource(view, text)) return true;
				if (html && text && !isTexpileCopy(html) && !smart) return view.pasteText(text);
				if (html) {
					// ProseMirror's own paste of the HTML goes ahead
					if (imagesLeftOut) warnImagesLeftOut();
					return false;
				}
				if (!text || !(smart || dialect === 'markdown')) return false;
				return looksLikeMarkdown(text, dialect) && pasteMarkdown(view, text, dialect);
			}
		}
	});
}
