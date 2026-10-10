import { Plugin, TextSelection, type EditorState, type Transaction } from 'prosemirror-state';
import { closeHistory } from 'prosemirror-history';
import type { Mark, Slice } from 'prosemirror-model';
import type { EditorView as PMView } from 'prosemirror-view';
import { settings } from '$lib/settings';
import { toVisualText, VISUAL_CARET } from '../expand/bodyTemplate';
import { autoMatches, type CompiledSnippet, type SnippetMatch } from '../expand/matchSnippets';
import { contextAllows } from '../expand/snippetZone';
import { snippetRegistry } from '../file/snippetRegistry';
import type { SnippetLanguage } from '../file/snippetTypes';

/** the file's language read into the editor's nodes; null when it does not read */
export type ReadSourceText = (text: string) => Slice | null;

const TEXT_ZONE = { zone: 'text', display: false } as const;
const WORD_CHAR = /[\p{L}\p{N}_]/u;

type TextBefore = { before: string; start: number };

function textBefore(state: EditorState, pos: number): TextBefore | null {
	const $pos = state.doc.resolve(pos);
	if (!$pos.parent.isTextblock || $pos.parent.type.spec.code) return null;
	let before = '';
	// one character per position: a citation's leafText would shift every offset after it
	$pos.parent.forEach((child, offset) => {
		if (offset < $pos.parentOffset)
			before += (child.isText ? child.text! : '\ufffc'.repeat(child.nodeSize)).slice(0, $pos.parentOffset - offset);
	});
	return { before, start: $pos.start() };
}

function textSnippets(list: readonly CompiledSnippet[]): CompiledSnippet[] {
	return list.filter((c) => contextAllows(c.snippet.context, TEXT_ZONE));
}

function placeCaret(tr: Transaction, from: number, to: number): void {
	let start = -1;
	let end = -1;
	let marks: readonly Mark[] = [];
	tr.doc.nodesBetween(from, to, (node, pos) => {
		if (!node.isText) return;
		const a = node.text!.indexOf(VISUAL_CARET.start);
		const b = node.text!.indexOf(VISUAL_CARET.end);
		if (a >= 0) [start, marks] = [pos + a, node.marks];
		if (b >= 0) end = pos + b;
	});
	if (start < 0 || end < start) return;
	tr.delete(end, end + 1).delete(start, start + 1);
	tr.setSelection(TextSelection.create(tr.doc, start, end - 1));
	// an empty stop inside \emph{} keeps its emphasis for what is typed next
	if (end - 1 === start) tr.setStoredMarks(marks);
}

function expandMatch(view: PMView, read: ReadSourceText, match: SnippetMatch, to: number): boolean {
	const slice = read(toVisualText(match.compiled.body, match.captures));
	if (!slice) return false;
	const tr = view.state.tr.replaceRange(match.from, to, slice);
	placeCaret(tr, match.from, tr.mapping.map(to));
	view.dispatch(tr.scrollIntoView());
	return true;
}

/** text snippets in a visual editor: auto ones as their trigger is typed, the rest on Tab after it */
export function visualTextSnippets(lang: SnippetLanguage, read: ReadSourceText): Plugin {
	return new Plugin({
		props: {
			handleTextInput(view, from, to, text) {
				if (settings.current.autoSnippets === false || from !== to || view.composing) return false;
				const at = textBefore(view.state, from);
				const list = textSnippets(snippetRegistry().languages[lang].auto);
				if (!at || !list.length) return false;
				const [match] = autoMatches(list, at.before + text, at.start);
				if (!match) return false;
				// the character goes in on its own first, so one undo gives back what was typed
				view.dispatch(view.state.tr.insertText(text, from, to));
				view.dispatch(closeHistory(view.state.tr));
				expandMatch(view, read, match, from + text.length);
				return true;
			},
			handleKeyDown(view, event) {
				if (event.key !== 'Tab' || event.shiftKey || event.ctrlKey || event.metaKey || event.altKey) return false;
				const sel = view.state.selection;
				const at = sel.empty ? textBefore(view.state, sel.from) : null;
				if (!at) return false;
				const list = textSnippets(snippetRegistry().languages[lang].popup).filter((c) => !c.patterns);
				const match = autoMatches(list, at.before, at.start).find((found) => {
					const start = found.from - at.start;
					return start === 0 || !WORD_CHAR.test(at.before[start - 1]);
				});
				if (!match) return false;
				view.dispatch(closeHistory(view.state.tr));
				return expandMatch(view, read, match, sel.from);
			}
		}
	});
}
