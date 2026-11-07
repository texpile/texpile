// keyboard-shortcut formatting commands for Source mode, mirroring LaTeX Workshop's
// toggleSelectedKeyword (accept/wrap OR unwrap a \keyword{...} call) but bound to the SAME chords
// Visual mode already uses (EditorView.svelte's Mod-b/i/u/`/./,/Shift-b/Shift-`/m/Shift-m), so
// muscle memory carries over between Source and Visual instead of copying LaTeX Workshop's own
// leader-key (Ctrl+L, Ctrl+B) scheme, which nothing else in this app uses.
import type { EditorView } from '@codemirror/view';
import { cmCommandKeys } from '$lib/keybindings/editors/cmCommandKeys';
import { EditorSelection, type EditorState, type Extension, type TransactionSpec } from '@codemirror/state';

/** finds the nearest \keyword{...} enclosing `pos`, if any (single level, no nested-\keyword lookup). */
function findEnclosingMacro(text: string, pos: number, keyword: string): { from: number; to: number; inner: string } | null {
	let depth = 0;
	let openBrace = -1;
	for (let i = pos - 1; i >= 0; i--) {
		const ch = text[i];
		if (ch === '}') depth++;
		else if (ch === '{') {
			if (depth === 0) {
				openBrace = i;
				break;
			}
			depth--;
		}
	}
	if (openBrace < 0) return null;
	const needle = '\\' + keyword;
	if (text.slice(Math.max(0, openBrace - needle.length), openBrace) !== needle) return null;
	const macroStart = openBrace - needle.length;
	let d = 0;
	for (let i = openBrace; i < text.length; i++) {
		if (text[i] === '{') d++;
		else if (text[i] === '}') {
			d--;
			if (d === 0) return { from: macroStart, to: i + 1, inner: text.slice(openBrace + 1, i) };
		}
	}
	return null;
}

/**
 * computes the toggle edit for \keyword{...} around each selection: wraps plain text, unwraps if
 * the selection (or, for an empty selection, the cursor) is already inside one. Pure function of
 * state so it's unit-testable without a DOM-backed EditorView; multi-cursor selections are
 * handled independently, right-to-left so earlier edits don't shift later offsets.
 */
export function computeToggleWrap(state: EditorState, keyword: string): TransactionSpec {
	const text = state.doc.toString();
	const ranges = [...state.selection.ranges].sort((a, b) => b.from - a.from);
	const changes: { from: number; to: number; insert: string }[] = [];
	let newSelectionPos: number | null = null;

	for (const range of ranges) {
		if (range.empty) {
			const enclosing = findEnclosingMacro(text, range.from, keyword);
			if (enclosing) {
				changes.push({ from: enclosing.from, to: enclosing.to, insert: enclosing.inner });
				newSelectionPos = enclosing.from + enclosing.inner.length;
			} else {
				const insert = `\\${keyword}{}`;
				changes.push({ from: range.from, to: range.from, insert });
				newSelectionPos = range.from + insert.length - 1; // land between the braces
			}
			continue;
		}
		const selected = text.slice(range.from, range.to);
		const opener = `\\${keyword}{`;
		if (selected.startsWith(opener) && selected.endsWith('}')) {
			const inner = selected.slice(opener.length, -1);
			changes.push({ from: range.from, to: range.to, insert: inner });
		} else {
			changes.push({ from: range.from, to: range.to, insert: `${opener}${selected}}` });
		}
	}

	return {
		changes,
		selection: ranges.length === 1 && newSelectionPos != null ? { anchor: newSelectionPos } : undefined,
		scrollIntoView: true
	};
}

function toggleWrapKeyword(view: EditorView, keyword: string): boolean {
	view.dispatch(computeToggleWrap(view.state, keyword));
	return true;
}

/** one-way wrap (no toggle-off): for block-level constructs where "unwrap" isn't well-defined. */
export function computeWrapBlock(state: EditorState, before: string, after: string): TransactionSpec {
	const { from, to } = state.selection.main;
	const selected = state.sliceDoc(from, to);
	return {
		changes: { from, to, insert: before + selected + after },
		selection: { anchor: from + before.length, head: from + before.length + selected.length },
		scrollIntoView: true
	};
}

/** `\href{https://}{label}`: label = the selection (or 'text'), the URL left selected for typing
 *  over — the same shape the md/typ source links insert, so all three source bars behave alike. */
export function computeLink(state: EditorState): TransactionSpec {
	const range = state.selection.main;
	const selected = state.sliceDoc(range.from, range.to);
	const label = selected || 'text';
	const url = 'https://';
	const insert = `\\href{${url}}{${label}}`;
	const urlStart = range.from + 6; // past "\href{"
	return {
		changes: { from: range.from, to: range.to, insert },
		selection: EditorSelection.range(urlStart, urlStart + url.length),
		scrollIntoView: true
	};
}

function wrapBlock(view: EditorView, before: string, after: string): boolean {
	view.dispatch(computeWrapBlock(view.state, before, after));
	return true;
}

/** the Source-mode keys, the same commands as Visual mode's */
export function formatShortcuts(): Extension {
	return cmCommandKeys({
		'editor.bold': (v) => toggleWrapKeyword(v, 'textbf'),
		'editor.italic': (v) => toggleWrapKeyword(v, 'textit'),
		'editor.underline': (v) => toggleWrapKeyword(v, 'underline'),
		'editor.inlineCode': (v) => toggleWrapKeyword(v, 'texttt'),
		'editor.superscript': (v) => toggleWrapKeyword(v, 'textsuperscript'),
		'editor.subscript': (v) => toggleWrapKeyword(v, 'textsubscript'),
		'editor.blockquote': (v) => wrapBlock(v, '\\begin{quote}\n', '\n\\end{quote}'),
		'editor.codeBlock': (v) => wrapBlock(v, '\\begin{verbatim}\n', '\n\\end{verbatim}'),
		'editor.heading1': (v) => wrapBlock(v, '\\section{', '}'),
		'editor.heading2': (v) => wrapBlock(v, '\\subsection{', '}'),
		'editor.heading3': (v) => wrapBlock(v, '\\subsubsection{', '}'),
		'editor.inlineMath': (v) => wrapBlock(v, '\\(', '\\)'),
		'editor.displayMath': (v) => wrapBlock(v, '\\[', '\\]')
	});
}
