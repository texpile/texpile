// a heading folds down to the next heading of the same or higher level
import { ensureSyntaxTree, foldGutter, foldKeymap, foldService, syntaxTree } from '@codemirror/language';
import { EditorView, keymap } from '@codemirror/view';
import { mount, unmount, type Component } from 'svelte';
import ChevronDown from '@lucide/svelte/icons/chevron-down';
import ChevronRight from '@lucide/svelte/icons/chevron-right';
import type { SyntaxNode, Tree } from '@lezer/common';
import { docText } from '$lib/editor/source/docText';
import { commandsWith, commonFacts } from '../knowledge/commands/commandFacts';
import { BRACED_OR_OPTIONAL, opensArgument } from '../syntax/commandTokens';
import { documentWrapperIn } from '../syntax/documentWrapper';
import type { EditorState } from '@codemirror/state';
import type { Extension } from '@codemirror/state';

const HEADINGS = new Set(commandsWith('section'));
const PARSE_BUDGET_MS = 100;

function foldTree(state: EditorState): Tree {
	return ensureSyntaxTree(state, state.doc.length, PARSE_BUDGET_MS) ?? syntaxTree(state);
}

function environmentNameOf(state: EditorState, node: SyntaxNode): string {
	return state.sliceDoc(node.from, node.to).replace(/^\\(?:begin|end)\s*\{\s*|\s*\}$/g, '');
}

function environmentFoldRange(state: EditorState, lineStart: number, lineEnd: number): { from: number; to: number } | null {
	let range: { from: number; to: number } | null = null;
	foldTree(state).iterate({
		from: lineStart,
		to: lineEnd,
		enter(ref) {
			if (range || ref.from < lineStart || (ref.name !== 'BeginEnv' && ref.name !== 'VerbatimBegin')) return !range;
			const end = ref.node.parent?.lastChild;
			const name = environmentNameOf(state, ref.node);
			// folding the whole document body is useless
			if (!end || end.name !== 'EndEnv' || name === 'document' || environmentNameOf(state, end) !== name) return false;
			if (end.from > ref.to) range = { from: ref.to, to: end.from };
			return false;
		}
	});
	return range;
}

type Heading = { at: number; level: number };

const headingLists = new WeakMap<Tree, Heading[]>();

// the commands that open a title, short or long
function headingsOf(state: EditorState, tree: Tree): Heading[] {
	let found = headingLists.get(tree);
	if (found) return found;
	const list: Heading[] = [];
	function read(from: number, to: number): string {
		return state.sliceDoc(from, to);
	}
	tree.iterate({
		enter(ref) {
			if (ref.name !== 'ControlWord') return;
			const name = read(ref.from + 1, ref.to);
			if (HEADINGS.has(name) && opensArgument(read, ref.node, true, BRACED_OR_OPTIONAL))
				list.push({ at: ref.from, level: commonFacts(name).section ?? 0 });
		}
	});
	found = list;
	headingLists.set(tree, found);
	return found;
}

function sectionFoldRange(state: EditorState, lineStart: number, lineEnd: number): { from: number; to: number } | null {
	const headings = headingsOf(state, foldTree(state));
	let index = 0;
	for (let high = headings.length; index < high;) {
		const mid = (index + high) >> 1;
		if (headings[mid].at < lineStart) index = mid + 1;
		else high = mid;
	}
	const own = headings[index];
	if (!own || own.at >= lineEnd) return null;
	// only a line's first heading counts, so a deeper one skips the rest of its line
	let skipTo = lineEnd;
	for (let i = index + 1; i < headings.length; i++) {
		const next = headings[i];
		if (next.at < skipTo) continue;
		const line = state.doc.lineAt(next.at);
		if (next.level > own.level) {
			skipTo = line.to + 1;
			continue;
		}
		const prevLine = state.doc.line(line.number - 1);
		return prevLine.to <= lineEnd ? null : { from: lineEnd, to: prevLine.to };
	}
	const lastLine = state.doc.line(state.doc.lines);
	return lastLine.to <= lineEnd ? null : { from: lineEnd, to: lastLine.to };
}

/** the preamble folds on the \documentclass line, down to the line before \begin{document} */
function preambleFoldRange(state: EditorState, lineStart: number, lineEnd: number): { from: number; to: number } | null {
	const line = state.doc.sliceString(lineStart, lineEnd);
	const first = lineStart + line.length - line.trimStart().length;
	const tree = foldTree(state);
	const word = tree.resolveInner(first, 1);
	// at the line's start only, so a commented-out class is left alone
	if (word.name !== 'ControlWord' || word.from !== first || state.sliceDoc(word.from, word.to) !== '\\documentclass') return null;
	const begin = documentWrapperIn(docText(state.doc), tree)?.begin;
	if (!begin || begin.from <= lineEnd) return null;
	const prevLine = state.doc.line(state.doc.lineAt(begin.from).number - 1);
	return prevLine.to > lineEnd ? { from: lineEnd, to: prevLine.to } : null;
}

/** combined fold-range lookup, exported for unit testing without a DOM-backed EditorView. */
export function foldRangeAt(state: EditorState, lineStart: number, lineEnd: number): { from: number; to: number } | null {
	return (
		preambleFoldRange(state, lineStart, lineEnd) ??
		environmentFoldRange(state, lineStart, lineEnd) ??
		sectionFoldRange(state, lineStart, lineEnd)
	);
}

// markerDOM runs per visible line, so render each icon once and clone it
const iconCache = new Map<Component, string>();

function iconHtml(icon: Component): string {
	let html = iconCache.get(icon);
	if (html === undefined) {
		const host = document.createElement('div');
		const app = mount(icon, { target: host, props: { size: 12, strokeWidth: 2.5 } });
		html = host.innerHTML;
		void unmount(app);
		iconCache.set(icon, html);
	}
	return html;
}

/** shared with the Typst folding setup, so every source pane folds with the same chevrons */
export function foldMarkerDom(open: boolean): HTMLElement {
	const span = document.createElement('span');
	span.className = 'cm-foldMarker';
	// markerDOM opts out of CodeMirror's own title, so carry it ourselves
	span.title = open ? 'Fold line' : 'Unfold line';
	span.innerHTML = iconHtml(open ? ChevronDown : ChevronRight); // lucide's own markup, not user input
	return span;
}

export const foldMarkerTheme = EditorView.baseTheme({
	'.cm-foldGutter .cm-foldMarker': {
		display: 'flex',
		alignItems: 'center',
		justifyContent: 'center',
		height: '100%',
		opacity: '0.45',
		cursor: 'pointer'
	},
	'.cm-foldGutter .cm-foldMarker:hover': { opacity: '1' }
});

/** folding for LaTeX source: environments and section headings. */
export function latexFolding(): Extension {
	return [foldService.of(foldRangeAt), foldGutter({ markerDOM: foldMarkerDom }), foldMarkerTheme, keymap.of(foldKeymap)];
}
