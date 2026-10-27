// a heading folds down to the next heading of the same or higher level
import { foldGutter, foldKeymap, foldService, syntaxTree } from '@codemirror/language';
import { EditorView, keymap } from '@codemirror/view';
import { mount, unmount, type Component } from 'svelte';
import ChevronDown from '@lucide/svelte/icons/chevron-down';
import ChevronRight from '@lucide/svelte/icons/chevron-right';
import type { SyntaxNode, Tree } from '@lezer/common';
import { docText } from '$lib/editor/source/docText';
import { commandsWith, commonFacts } from '../knowledge/commands/commandFacts';
import type { EditorState } from '@codemirror/state';
import type { Extension } from '@codemirror/state';

const SECTION_RE = new RegExp(`\\\\(${commandsWith('section').join('|')})\\*?\\{`);
// same pattern with 'g' so sectionFoldRange can scan the flat doc string via lastIndex
const SECTION_SCAN_RE = new RegExp(SECTION_RE.source, 'g');

function inCode(tree: Tree, pos: number): boolean {
	return pos >= tree.length || tree.resolveInner(pos, 1).name === 'ControlWord';
}

function environmentNameOf(state: EditorState, node: SyntaxNode): string {
	return state.sliceDoc(node.from, node.to).replace(/^\\(?:begin|end)\s*\{\s*|\s*\}$/g, '');
}

function environmentFoldRange(state: EditorState, lineStart: number, lineEnd: number): { from: number; to: number } | null {
	let range: { from: number; to: number } | null = null;
	syntaxTree(state).iterate({
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

function sectionFoldRange(state: EditorState, lineStart: number, lineEnd: number): { from: number; to: number } | null {
	const line = state.doc.sliceString(lineStart, lineEnd);
	const m = SECTION_RE.exec(line);
	const tree = syntaxTree(state);
	if (!m || !inCode(tree, lineStart + m.index)) return null;
	const level = commonFacts(m[1]).section ?? 0;
	// flat scan of the cached doc string instead of walking doc.line(n) line by line
	const fullText = docText(state.doc);
	SECTION_SCAN_RE.lastIndex = lineEnd;
	let next: RegExpExecArray | null;
	while ((next = SECTION_SCAN_RE.exec(fullText))) {
		if (!inCode(tree, next.index)) continue;
		if ((commonFacts(next[1]).section ?? 0) > level) {
			// only a line's first heading counts (as in the old per-line scan), so skip the line's rest
			SECTION_SCAN_RE.lastIndex = state.doc.lineAt(next.index).to;
			continue;
		}
		const prevLine = state.doc.line(state.doc.lineAt(next.index).number - 1);
		if (prevLine.to <= lineEnd) return null;
		return { from: lineEnd, to: prevLine.to };
	}
	const lastLine = state.doc.line(state.doc.lines);
	if (lastLine.to <= lineEnd) return null;
	return { from: lineEnd, to: lastLine.to };
}

// a \begin{document} that is code, not one in a comment
const BEGIN_DOCUMENT_RE = /^[^%\n]*\\begin\{document\}/gm;

/** the preamble folds on the \documentclass line, down to the line before \begin{document} */
function preambleFoldRange(state: EditorState, lineStart: number, lineEnd: number): { from: number; to: number } | null {
	// at the line's start only, so a commented-out class is left alone
	if (!/^\s*\\documentclass\b/.test(state.doc.sliceString(lineStart, lineEnd))) return null;
	BEGIN_DOCUMENT_RE.lastIndex = lineEnd;
	const begin = BEGIN_DOCUMENT_RE.exec(docText(state.doc));
	if (!begin) return null;
	const prevLine = state.doc.line(state.doc.lineAt(begin.index).number - 1);
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
