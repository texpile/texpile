// LaTeX Suite's typing helpers that need the structure around the cursor, which a snippet pattern
// cannot see: auto-fraction, Tab out of brackets and formulas, and matrix keys
import { hasNextSnippetField } from '@codemirror/autocomplete';
import { syntaxTree } from '@codemirror/language';
import { Prec, type EditorState, type Extension } from '@codemirror/state';
import { EditorView, keymap, type EditorView as CMView } from '@codemirror/view';
import { settings } from '$lib/settings';
import { expandSnippet } from '../expand/expandSnippet';
import { mathBoundsAt, snippetZoneAt } from '../expand/snippetZone';
import type { SnippetLanguage } from '../file/snippetTypes';
import { numeratorOf, termStart } from './mathTerm';

const MATRIX_ENV = /^(?:[pbBvV]?matrix|smallmatrix|array|align\*?|aligned|alignat\*?|alignedat|split|cases|dcases|eqnarray\*?|gathered)$/;
const ENV_EDGE = /\\(begin|end)\s*\{([^{}]+)\}/g;
const MATRIX_WINDOW = 20000;
// the fraction an earlier / made, still empty below
const FRESH_FRACTION = /\\frac\{((?:[^{}]|\{[^{}]*\})*)\}\{$/;

function inMath(state: EditorState, pos: number, lang: SnippetLanguage): boolean {
	return snippetZoneAt(state, pos, lang)?.zone === 'math';
}

function autoFraction(lang: SnippetLanguage, stopUndoCapture: () => void): Extension {
	return EditorView.inputHandler.of((view, from, to, text) => {
		if (text !== '/' || from !== to || settings.current.autoFraction !== true || view.composing) return false;
		if (!inMath(view.state, from, lang)) return false;
		const line = view.state.doc.lineAt(from);
		const before = line.text.slice(0, from - line.from);
		// a second / takes the fraction back to the plain slash
		const fresh = FRESH_FRACTION.exec(before);
		if (fresh && view.state.sliceDoc(from, from + 1) === '}') {
			const start = line.from + fresh.index;
			view.dispatch({
				changes: { from: start, to: from + 1, insert: `${fresh[1]}/` },
				selection: { anchor: start + fresh[1].length + 1 },
				userEvent: 'input.type'
			});
			return true;
		}
		const start = termStart(before);
		if (start === before.length) return false;
		view.dispatch({ changes: { from, insert: '/' }, selection: { anchor: from + 1 }, userEvent: 'input.type' });
		stopUndoCapture();
		const numerator = numeratorOf(before.slice(start));
		expandSnippet(view, '\\\\frac{${TM_SELECTED_TEXT}}{$1}$0', line.from + start, from + 1, { selection: numerator, captures: [] });
		return true;
	});
}

function onlyIndentBefore(state: EditorState, pos: number): boolean {
	const line = state.doc.lineAt(pos);
	return /^\s*$/.test(line.text.slice(0, pos - line.from));
}

function tabOut(lang: SnippetLanguage) {
	return (view: CMView): boolean => {
		const { state } = view;
		const sel = state.selection.main;
		if (settings.current.tabOut === false || !sel.empty || hasNextSnippetField(state) || onlyIndentBefore(state, sel.head)) return false;
		const bounds = inMath(state, sel.head, lang) ? mathBoundsAt(state, sel.head, lang) : null;
		if (!bounds) return false;
		const rest = state.sliceDoc(sel.head, bounds.innerTo);
		const closer = /[)\]}]/.exec(rest);
		view.dispatch({ selection: { anchor: closer ? sel.head + closer.index + 1 : bounds.to }, scrollIntoView: true });
		return true;
	};
}

/** the innermost LaTeX environment open at `pos` */
function openEnvironment(state: EditorState, pos: number): string | null {
	const text = state.sliceDoc(Math.max(0, pos - MATRIX_WINDOW), pos);
	const open: string[] = [];
	for (const m of text.matchAll(ENV_EDGE)) {
		if (m[1] === 'begin') open.push(m[2].trim());
		else if (open.at(-1) === m[2].trim()) open.pop();
	}
	return open.at(-1) ?? null;
}

function inTypstMatrix(state: EditorState, pos: number): boolean {
	for (let node = syntaxTree(state).resolveInner(pos, -1); node.parent; node = node.parent) {
		if (node.name === 'Equation') return false;
		if (node.name === 'MathArgs' && node.parent?.name === 'MathCall') {
			const callee = node.parent.firstChild;
			if (callee && state.sliceDoc(callee.from, callee.to) === 'mat' && pos > node.from && pos < node.to) return true;
		}
	}
	return false;
}

function inMatrix(state: EditorState, pos: number, lang: SnippetLanguage): boolean {
	if (settings.current.matrixKeys === false || !inMath(state, pos, lang)) return false;
	if (lang === 'typst') return inTypstMatrix(state, pos);
	const env = openEnvironment(state, pos);
	return !!env && MATRIX_ENV.test(env);
}

function matrixKey(lang: SnippetLanguage, insert: (state: EditorState, pos: number) => string) {
	return (view: CMView): boolean => {
		const sel = view.state.selection.main;
		if (hasNextSnippetField(view.state) || !inMatrix(view.state, sel.from, lang)) return false;
		const text = insert(view.state, sel.from);
		view.dispatch(view.state.replaceSelection(text), { userEvent: 'input' });
		return true;
	};
}

function newRow(lang: SnippetLanguage) {
	return (state: EditorState, pos: number): string => {
		const indent = /^\s*/.exec(state.doc.lineAt(pos).text)![0];
		return lang === 'typst' ? '; ' : ` \\\\\n${indent}`;
	};
}

/** auto-fraction (LaTeX and Markdown), Tab out and matrix keys for a source editor */
export function mathKeys(lang: SnippetLanguage, stopUndoCapture: () => void): Extension {
	return [
		lang === 'typst' ? [] : autoFraction(lang, stopUndoCapture),
		// above indentWithTab; the snippet keymap is above this while a snippet has stops left
		Prec.high(
			keymap.of([
				{ key: 'Tab', run: matrixKey(lang, () => (lang === 'typst' ? ', ' : ' & ')) },
				{ key: 'Shift-Enter', run: matrixKey(lang, newRow(lang)) },
				{ key: 'Tab', run: tabOut(lang) }
			])
		)
	];
}
