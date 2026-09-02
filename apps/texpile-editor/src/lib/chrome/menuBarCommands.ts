// menu-bar editor commands. visual mode always targets the PM doc (a raw CM block is still a
// PM node); only source mode targets the SourceEditor's CodeMirror.
//
// Dialect-aware on both paths: the CM wraps write the open file's own syntax, and the PM commands
// read the mark/node off the view's OWN schema - the tex, md and typ editors are three different
// Schema objects, and a MarkType from one must never be dispatched into another.
import { toggleSearchPanel } from '$lib/editor/source/extensions/search-panel/searchPanel.svelte';
import { EditorView as CMView } from '@codemirror/view';
import { undo as cmUndo, redo as cmRedo } from '@codemirror/commands';
import { undo, redo } from 'prosemirror-history';
import { toggleMark } from 'prosemirror-commands';
import { toggleHeading, toggleBlockQuote } from '$lib/editor/visual/helperCommands';
import { editorViewStore, displaySearchBarStore, viewMode, sourceCmView } from '$lib/stores/editorStore';
import { computeToggleWrap, computeWrapBlock } from '$lib/languages/latex/intellisense/shortcuts';
import {
	computeToggleDelim as mdDelim,
	computeHeadingLine as mdHeading,
	computeQuoteLines as mdQuote
} from '$lib/languages/markdown/source/sourceInsert';
import {
	computeToggleDelim as typDelim,
	computeWrap as typWrap,
	computeHeadingLine as typHeading
} from '$lib/languages/typst/source/sourceInsert';
import type { TransactionSpec } from '@codemirror/state';
import type { Command, EditorState } from 'prosemirror-state';
import type { Node as PMNode } from 'prosemirror-model';

export type MenuDialect = 'tex' | 'md' | 'typ';

/** runs a PM command against the main editor, then refocuses it. */
export function runVisualCommand(cmd: Command) {
	const v = editorViewStore.current;
	if (!v) return;
	cmd(v.state, v.dispatch);
	v.focus();
}

/** toggles a mark by name, skipping silently when the open editor's schema lacks it. */
export function runMark(name: string, attrs?: Record<string, unknown>) {
	const v = editorViewStore.current;
	if (!v) return;
	const mark = v.state.schema.marks[name];
	if (!mark) return;
	toggleMark(mark, attrs)(v.state, v.dispatch);
	v.focus();
}

/** replaces the selection in the main editor with a freshly built node. */
export function insertNode(make: (state: EditorState) => PMNode | null) {
	const v = editorViewStore.current;
	if (!v) return;
	const node = make(v.state);
	if (node) {
		v.dispatch(v.state.tr.replaceSelectionWith(node));
		v.focus();
	}
}

/** the CM view the menu should target: source mode only, null in visual mode. */
export function activeCm(): CMView | null {
	if (viewMode.current !== 'source') return null;
	const cm = sourceCmView.current;
	return cm && cm.dom.isConnected ? cm : null;
}

/** dispatches a computed edit (the source toolbars' compute* functions), then refocuses - the
 *  menu and the toolbar run the SAME edit, so they cannot drift apart again. */
export function cmApply(cm: CMView, spec: TransactionSpec) {
	cm.dispatch({ scrollIntoView: true, ...spec });
	cm.focus();
}

/** wraps the CM selection with before/after (or inserts at the cursor), then refocuses. */
export function cmReplace(cm: CMView, before: string, after = '') {
	const { from, to } = cm.state.selection.main;
	const sel = cm.state.sliceDoc(from, to);
	cm.dispatch({
		changes: { from, to, insert: before + sel + after },
		selection: { anchor: from + before.length, head: from + before.length + sel.length },
		scrollIntoView: true
	});
	cm.focus();
}

export function editSelect(value: string) {
	// source mode: the document history and the search UI are CodeMirror's, not ProseMirror's
	const cm = activeCm();
	if (cm) {
		if (value === 'undo') cmUndo(cm);
		else if (value === 'redo') cmRedo(cm);
		else if (value === 'find') {
			toggleSearchPanel(cm); // opens focused, or closes, like the visual editor's bar
			return;
		}
		cm.focus();
		return;
	}
	if (value === 'undo') runVisualCommand(undo);
	else if (value === 'redo') runVisualCommand(redo);
	else if (value === 'find') displaySearchBarStore.current = !displaySearchBarStore.current;
}

export function formatSelect(value: string, dialect: MenuDialect = 'tex') {
	// Source mode dispatches the SAME compute* edits the source toolbars use, so a menu item and
	// its toolbar button cannot behave differently: bold TOGGLES (the old snippet table only ever
	// wrapped, so Bold on bold text nested another \textbf), headings set/replace/toggle their
	// level in place, and md quoting marks whole lines.
	const cm = activeCm();
	if (cm) {
		const s = cm.state;
		if (dialect === 'tex') {
			const MACRO: Partial<Record<string, string>> = { bold: 'textbf', italic: 'textit', underline: 'underline', code: 'texttt' };
			const H: Partial<Record<string, string>> = { h1: 'section', h2: 'subsection', h3: 'subsubsection' };
			if (MACRO[value]) cmApply(cm, computeToggleWrap(s, MACRO[value]));
			else if (H[value]) cmApply(cm, computeWrapBlock(s, `\\${H[value]}{`, '}'));
			else if (value === 'quote') cmApply(cm, computeWrapBlock(s, '\\begin{quote}\n', '\n\\end{quote}'));
		} else if (dialect === 'typ') {
			const DELIM: Partial<Record<string, string>> = { bold: '*', italic: '_', code: '`' };
			const LEVEL: Partial<Record<string, number>> = { h1: 1, h2: 2, h3: 3 };
			if (DELIM[value]) cmApply(cm, typDelim(s, DELIM[value]));
			else if (value === 'underline') cmApply(cm, typWrap(s, '#underline[', ']'));
			else if (LEVEL[value]) cmApply(cm, typHeading(s, LEVEL[value]));
			else if (value === 'quote') cmApply(cm, typWrap(s, '#quote(block: true)[', ']'));
		} else {
			// markdown has no underline; the menu hides the item
			const DELIM: Partial<Record<string, string>> = { bold: '**', italic: '*', code: '`' };
			const LEVEL: Partial<Record<string, number>> = { h1: 1, h2: 2, h3: 3 };
			if (DELIM[value]) cmApply(cm, mdDelim(s, DELIM[value]));
			else if (LEVEL[value]) cmApply(cm, mdHeading(s, LEVEL[value]));
			else if (value === 'quote') cmApply(cm, mdQuote(s));
		}
		return;
	}
	switch (value) {
		case 'bold':
			runMark('strong');
			break;
		case 'italic':
			runMark('em');
			break;
		case 'underline':
			runMark('u');
			break;
		case 'code':
			runMark('code');
			break;
		case 'h1':
			runVisualCommand(toggleHeading(1));
			break;
		case 'h2':
			runVisualCommand(toggleHeading(2));
			break;
		case 'h3':
			runVisualCommand(toggleHeading(3));
			break;
		case 'quote':
			runVisualCommand(toggleBlockQuote());
			break;
	}
}
