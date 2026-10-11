import { Plugin, Selection, TextSelection, type EditorState, type Transaction } from 'prosemirror-state';
import { closeHistory } from 'prosemirror-history';
import { Fragment, Slice, type Mark, type Node as PMNode, type Schema } from 'prosemirror-model';
import type { EditorView as PMView } from 'prosemirror-view';
import { toVisualText, VISUAL_CARET, type VisualBody } from '../expand/body/visualBody';
import { autoMatches, type CompiledSnippet, type SnippetMatch } from '../expand/matchSnippets';
import { contextAllows } from '../expand/snippetZone';
import { snippetRegistry } from '../file/snippetRegistry';
import type { SnippetLanguage } from '../file/snippetTypes';
import { sliceToLatex } from '$lib/editor/visual/extensions/latexClipboard';
import { sliceToTypst } from '$lib/languages/typst/visual/clipboard';

export type ReadSourceText = (text: string) => Slice | null;

export const TEXT_ZONE = { zone: 'text', display: false } as const;
const MARKERS = new RegExp(`[${VISUAL_CARET.start}${VISUAL_CARET.end}]`, 'g');
const WORD_CHAR = /[\p{L}\p{N}_]/u;
// a link's text is often its address
const NO_SNIPPET_MARKS = new Set(['code', 'link']);

type TextBefore = { before: string; start: number };

function textBefore(state: EditorState, pos: number): TextBefore | null {
	const $pos = state.doc.resolve(pos);
	if (!$pos.parent.isTextblock || $pos.parent.type.spec.code) return null;
	if ((state.storedMarks ?? $pos.marks()).some((mark) => NO_SNIPPET_MARKS.has(mark.type.name))) return null;
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

// a marker in a chip or an attribute would be saved, and one in a command name changes what the body reads as
function markersInText(slice: Slice): boolean {
	const found: [string, PMNode | null][] = [];
	slice.content.descendants((node, _pos, parent) => {
		for (const ch of node.text?.match(MARKERS) ?? []) found.push([ch, parent]);
	});
	const [[a, inA] = [], [b, inB] = []] = found;
	return (
		found.length === 2 && a === VISUAL_CARET.start && b === VISUAL_CARET.end && inA === inB && !!inA?.isTextblock && !inA.type.spec.code
	);
}

function stripMarkers(fragment: Fragment): Fragment {
	const nodes: PMNode[] = [];
	fragment.forEach((node) => {
		const text = node.isText ? node.text!.replace(MARKERS, '') : null;
		if (text === null) nodes.push(node.copy(stripMarkers(node.content)));
		else if (text) nodes.push(node.type.schema.text(text, node.marks));
	});
	return Fragment.fromArray(nodes);
}

function readBody(read: ReadSourceText, body: VisualBody): Slice | null {
	const plain = read(body.plain);
	if (!plain) return null;
	for (const text of body.marked) {
		const slice = read(text);
		if (slice && markersInText(slice) && new Slice(stripMarkers(slice.content), slice.openStart, slice.openEnd).eq(plain)) return slice;
	}
	return plain;
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
	if (start < 0) {
		const $to = tr.doc.resolve(to);
		const caret = Selection.findFrom($to, 1, true) ?? Selection.findFrom($to, -1, true);
		if (caret) tr.setSelection(caret);
		return;
	}
	tr.delete(end, end + 1).delete(start, start + 1);
	tr.setSelection(TextSelection.create(tr.doc, start, end - 1));
	// an empty stop inside \emph{} keeps its emphasis for what is typed next
	if (end - 1 === start) tr.setStoredMarks(marks);
}

export function insertVisualBody(view: PMView, read: ReadSourceText, body: VisualBody, from: number, to: number): boolean {
	const slice = readBody(read, body);
	if (!slice) return false;
	const tr = view.state.tr.replaceRange(from, to, slice);
	placeCaret(tr, from, tr.mapping.map(to));
	view.dispatch(tr.scrollIntoView());
	return true;
}

// a capture or a file name is visual text, so 50% has to reach the body as 50\%
export function textToSource(lang: SnippetLanguage, schema: Schema): (text: string) => string {
	return (text) => {
		if (!text) return '';
		const slice = new Slice(Fragment.from(schema.text(text)), 0, 0);
		return lang === 'typst' ? sliceToTypst(slice) : sliceToLatex(slice);
	};
}

function expandMatch(view: PMView, read: ReadSourceText, match: SnippetMatch, to: number): boolean {
	const toSource = textToSource(match.compiled.lang, view.state.schema);
	const body = toVisualText(match.compiled.body, { selection: '', captures: match.captures.map(toSource) }, toSource);
	return insertVisualBody(view, read, body, match.from, to);
}

/** auto snippets expand as typed, the rest on Tab */
export function visualTextSnippets(lang: SnippetLanguage, read: ReadSourceText): Plugin {
	return new Plugin({
		props: {
			handleTextInput(view, from, to, text) {
				if (from !== to || view.composing) return false;
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
