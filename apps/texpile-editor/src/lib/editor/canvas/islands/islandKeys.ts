// the keys a code island answers as the DOM editor's CodeMirror did (its defaultKeymap's line commands, Tab and the
// comment toggle), run on a CodeMirror state of the island's text and written back as one ProseMirror change
import { keydownHandler } from 'prosemirror-keymap';
import { exitCode } from 'prosemirror-commands';
import { Plugin, Selection, TextSelection } from 'prosemirror-state';
import type { Node as PMNode } from 'prosemirror-model';
import type { EditorView } from 'prosemirror-view';
import {
	EditorSelection,
	Transaction as CodeTransaction,
	type EditorState as CodeState,
	type SelectionRange,
	type TransactionSpec
} from '@codemirror/state';
import {
	copyLineDown,
	copyLineUp,
	deleteLine,
	indentLess,
	indentMore,
	insertNewlineAndIndent,
	moveLineDown,
	moveLineUp,
	toggleComment
} from '@codemirror/commands';
import { indentAtCaret } from '$lib/editor/source/extensions/keybindings/cmTabKey';
import { codeBlockLanguageName, languageNow, rawLanguageName } from '$lib/editor/code/languageFor';
import { blockIslandOf, islandCodeState, islandOf, writeBack } from './islandCode';

type CodeTarget = { state: CodeState; dispatch(tr: CodeTransaction | TransactionSpec): void };
type CodeCommand = (target: CodeTarget) => boolean;

/** deleteLine moves the caret down a line through the view, which here is a column on the next line */
function deleteIslandLine(target: CodeTarget): boolean {
	function moveVertically(range: SelectionRange, forward: boolean): SelectionRange {
		const { doc } = target.state;
		const line = doc.lineAt(range.head);
		const next = forward ? line.number + 1 : line.number - 1;
		if (next < 1 || next > doc.lines) return EditorSelection.cursor(forward ? doc.length : 0);
		const to = doc.line(next);
		return EditorSelection.cursor(to.from + Math.min(range.head - line.from, to.length));
	}
	return (deleteLine as unknown as CodeCommand)(Object.assign(Object.create(target) as CodeTarget, { moveVertically }));
}

const LINE_KEYS: Record<string, CodeCommand> = {
	Enter: insertNewlineAndIndent,
	Tab: indentAtCaret as unknown as CodeCommand,
	'Shift-Tab': indentLess,
	'Mod-]': indentMore,
	'Mod-[': indentLess,
	'Alt-ArrowUp': moveLineUp,
	'Alt-ArrowDown': moveLineDown,
	'Shift-Alt-ArrowUp': copyLineUp,
	'Shift-Alt-ArrowDown': copyLineDown,
	'Shift-Mod-k': deleteIslandLine
};

const ANY_KEYS: Record<string, CodeCommand> = { 'Mod-/': toggleComment as unknown as CodeCommand };

function languageOf(island: PMNode) {
	const name =
		island.type.name === 'code_block' ? codeBlockLanguageName(island.attrs.lang) : rawLanguageName(island.attrs.lang, island.textContent);
	return languageNow(name);
}

export function runIslandCommand(view: EditorView, command: CodeCommand, lines: boolean): boolean {
	const found = islandOf(view);
	if (!found || (lines && !found.island.isBlock) || !view.editable) return false;
	const language = languageOf(found.island);
	const state = islandCodeState(view, found, language ? [language.extension] : []);
	let done: CodeTransaction | null = null;
	if (!command({ state, dispatch: (tr) => (done = tr instanceof CodeTransaction ? tr : state.update(tr)) }) || !done) return false;
	view.dispatch(writeBack(view, found.start, done as CodeTransaction));
	return true;
}

/** out of the code: below a block the way exitCode leaves code, past an inline chip in its paragraph */
function exitIsland(view: EditorView): boolean {
	const found = islandOf(view);
	if (!found) return false;
	if (exitCode(view.state, view.dispatch)) return true;
	if (found.island.isBlock) return false;
	const $after = view.state.doc.resolve(found.start - 1 + found.island.nodeSize);
	view.dispatch(view.state.tr.setSelection(Selection.near($after, 1)).scrollIntoView());
	return true;
}

/** Backspace in an island with nothing left removes it; a block counts as empty with only white space */
function deleteEmptyIsland(view: EditorView): boolean {
	const found = islandOf(view);
	if (!found || !view.state.selection.empty) return false;
	const text = found.island.textContent;
	if (found.island.isBlock ? text.trim() !== '' : text !== '') return false;
	const pos = found.start - 1;
	view.dispatch(view.state.tr.delete(pos, pos + found.island.nodeSize).scrollIntoView());
	return true;
}

/** a deletion at the island's edge stops there, as in its CodeMirror; the base keymap would join it with the block beside it */
function holdAtIslandEdge(dir: -1 | 1) {
	return (view: EditorView): boolean => {
		const found = blockIslandOf(view);
		const { selection } = view.state;
		if (!found || !selection.empty) return false;
		return selection.head === (dir < 0 ? found.start : found.start + found.island.content.size);
	};
}

function inlineEnter(view: EditorView): boolean {
	const found = islandOf(view);
	return !!found && !found.island.isBlock && exitIsland(view);
}

/** Ctrl+Home and Ctrl+End go to the island's own start and end, as its CodeMirror did; the setup's keymap would leave it */
function islandEdge(dir: -1 | 1, extend: boolean) {
	return (_state: unknown, _dispatch: unknown, view?: EditorView): boolean => {
		const found = view && blockIslandOf(view);
		if (!view || !found) return false;
		const edge = dir < 0 ? found.start : found.start + found.island.content.size;
		const anchor = extend ? view.state.selection.anchor : edge;
		view.dispatch(view.state.tr.setSelection(TextSelection.create(view.state.doc, anchor, edge)).scrollIntoView());
		return true;
	};
}

const MOVE_KEYS = {
	'Mod-Home': islandEdge(-1, false),
	'Mod-End': islandEdge(1, false),
	'Shift-Mod-Home': islandEdge(-1, true),
	'Shift-Mod-End': islandEdge(1, true)
};

const EDGE_KEYS: Record<string, (view: EditorView) => boolean> = {
	'Mod-Enter': exitIsland,
	'Ctrl-Enter': exitIsland,
	Enter: inlineEnter,
	Backspace: (view) => deleteEmptyIsland(view) || holdAtIslandEdge(-1)(view),
	'Mod-Backspace': holdAtIslandEdge(-1),
	'Alt-Backspace': holdAtIslandEdge(-1),
	Delete: holdAtIslandEdge(1),
	'Mod-Delete': holdAtIslandEdge(1),
	'Alt-Delete': holdAtIslandEdge(1)
};

function bindings(keys: Record<string, CodeCommand>, lines: boolean) {
	return Object.fromEntries(
		Object.entries(keys).map(([key, command]) => [
			key,
			(_state: unknown, _dispatch: unknown, view?: EditorView) => !!view && runIslandCommand(view, command, lines)
		])
	);
}

function edgeBindings() {
	return Object.fromEntries(
		Object.entries(EDGE_KEYS).map(([key, run]) => [
			key,
			(_state: unknown, _dispatch: unknown, view?: EditorView) => !!view && view.editable && run(view)
		])
	);
}

function chained(...maps: Record<string, (state: unknown, dispatch: unknown, view?: EditorView) => boolean>[]) {
	const keys = new Set(maps.flatMap((map) => Object.keys(map)));
	return Object.fromEntries(
		[...keys].map((key) => [
			key,
			(state: unknown, dispatch: unknown, view?: EditorView) => maps.some((map) => map[key]?.(state, dispatch, view))
		])
	);
}

export function islandKeysPlugin(): Plugin {
	return new Plugin({
		props: { handleKeyDown: keydownHandler(chained(MOVE_KEYS, edgeBindings(), bindings(LINE_KEYS, true), bindings(ANY_KEYS, false))) }
	});
}
