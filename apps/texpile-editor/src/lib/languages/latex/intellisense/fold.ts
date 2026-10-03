// code folding: \begin{…}/\end{…} environment pairs (depth-matched, same-name only), section
// headings (folds a heading down to the next heading of the same or higher level), and the preamble
// (\documentclass down to \begin{document}). All are flat text scans via foldService rather than a
// language-aware fold prop, since the bundled LaTeX mode is a legacy StreamLanguage with no syntax
// tree to hang a fold prop on.
import { foldGutter, foldKeymap, foldService } from '@codemirror/language';
import { EditorView, keymap } from '@codemirror/view';
import { mount, unmount, type Component } from 'svelte';
import ChevronDown from '@lucide/svelte/icons/chevron-down';
import ChevronRight from '@lucide/svelte/icons/chevron-right';
import { docText } from '$lib/editor/source/docText';
import type { EditorState } from '@codemirror/state';
import type { Extension } from '@codemirror/state';

const SECTION_LEVELS = ['part', 'chapter', 'section', 'subsection', 'subsubsection'];
const SECTION_RE = new RegExp(`\\\\(${SECTION_LEVELS.join('|')})\\*?\\{`);
// same pattern with 'g' so sectionFoldRange can scan the flat doc string via lastIndex
const SECTION_SCAN_RE = new RegExp(SECTION_RE.source, 'g');

// how far past a \begin we look for its \end — a fold target further away is useless, and without
// a cap an unterminated environment costs a full-doc scan per viewport line
const ENV_SCAN_CAP = 100_000;

function environmentFoldRange(state: EditorState, lineStart: number, lineEnd: number): { from: number; to: number } | null {
	const line = state.doc.sliceString(lineStart, lineEnd);
	const beginMatch = /\\begin\{([a-zA-Z*]+)\}/.exec(line);
	if (!beginMatch) return null;
	const name = beginMatch[1];
	// folding the whole document body is useless, and its \end sits at doc end — the worst-case scan
	if (name === 'document') return null;
	const beginAt = lineStart + beginMatch.index + beginMatch[0].length;
	const cap = beginAt + ENV_SCAN_CAP;

	const openRe = new RegExp(`\\\\begin\\{${name}\\}`, 'g');
	const closeRe = new RegExp(`\\\\end\\{${name}\\}`, 'g');
	const fullText = docText(state.doc);
	let depth = 1;
	let searchFrom = beginAt;
	let noMoreOpens = false; // once exec misses, later offsets miss too — skip the rescans
	while (depth > 0) {
		openRe.lastIndex = searchFrom;
		closeRe.lastIndex = searchFrom;
		const nextOpen = noMoreOpens ? null : openRe.exec(fullText);
		if (!nextOpen) noMoreOpens = true;
		const nextClose = closeRe.exec(fullText);
		if (!nextClose) return null; // unterminated environment, mid-edit
		// the matching \end can only sit at or past nextClose, so past the cap means give up
		if (nextClose.index > cap) return null;
		if (nextOpen && nextOpen.index < nextClose.index) {
			depth++;
			searchFrom = nextOpen.index + nextOpen[0].length;
		} else {
			depth--;
			if (depth === 0) {
				const closeAt = nextClose.index;
				if (closeAt <= beginAt) return null;
				return { from: beginAt, to: closeAt };
			}
			searchFrom = nextClose.index + nextClose[0].length;
		}
	}
	return null;
}

function sectionFoldRange(state: EditorState, lineStart: number, lineEnd: number): { from: number; to: number } | null {
	const line = state.doc.sliceString(lineStart, lineEnd);
	const m = SECTION_RE.exec(line);
	if (!m) return null;
	const level = SECTION_LEVELS.indexOf(m[1]);
	// flat scan of the cached doc string instead of walking doc.line(n) line by line
	const fullText = docText(state.doc);
	SECTION_SCAN_RE.lastIndex = lineEnd;
	let next: RegExpExecArray | null;
	while ((next = SECTION_SCAN_RE.exec(fullText))) {
		if (SECTION_LEVELS.indexOf(next[1]) > level) {
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
