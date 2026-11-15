/* eslint-disable no-param-reassign -- markdown-it rules write their handed state and parser */
import type { MarkdownIt, StateBlock, StateInline } from 'markdown-it';
import { convertLatexToMarkup } from 'mathlive';
import { mathMacros, mathMacrosKey } from '$lib/editor/visual/extensions/mathlivebridge/mathMacros.svelte';
import { themeStaticMarkup } from '$lib/editor/visual/extensions/mathlivebridge/themeBlack';
import { closesInOneLine, inlineMathEnd } from '$lib/languages/markdown/syntax/mathSyntax';
import 'mathlive/static.css';

const BACKSLASH = 92;
const DOLLAR = 36;
const KEPT_FORMULAS = 500;
const kept = new Map<string, string>();

function typesetLatex(latex: string): string | null {
	const key = `${mathMacrosKey()}\0${latex}`;
	let markup = kept.get(key);
	if (markup === undefined) {
		try {
			markup = themeStaticMarkup(convertLatexToMarkup(latex, { defaultMode: 'math', macros: mathMacros.current }));
		} catch {
			return null;
		}
		if (kept.size >= KEPT_FORMULAS) kept.delete(kept.keys().next().value!);
		kept.set(key, markup);
	}
	return markup;
}

function inlineMath(state: StateInline, silent: boolean): boolean {
	const { src, pos } = state;
	const code = src.charCodeAt(pos);
	let end = -1;
	let open = 0;
	let close = 0;
	if (code === DOLLAR) {
		end = inlineMathEnd(src, pos);
		open = src.charCodeAt(pos + 1) === DOLLAR ? 2 : 1;
		close = open;
	} else if (code === BACKSLASH && src.charCodeAt(pos + 1) === 40) {
		const at = src.indexOf('\\)', pos + 2);
		const body = at < 0 ? '' : src.slice(pos + 2, at);
		if (body.trim() && !body.includes('\n\n')) end = at + 2;
		open = 2;
		close = 2;
	}
	// a code span opening inside the candidate belongs to the code, not to the formula
	if (end < 0 || src.slice(pos, end).includes('`')) return false;
	if (!silent) {
		const token = state.push('math_inline', '', 0);
		token.content = src.slice(pos + open, end - close).trim();
		token.markup = src.slice(pos, pos + open);
	}
	state.pos = end;
	return true;
}

function lineText(state: StateBlock, line: number): string {
	return state.src.slice(state.bMarks[line] + state.tShift[line], state.eMarks[line]);
}

function mathBlock(state: StateBlock, startLine: number, endLine: number, silent: boolean): boolean {
	if (state.sCount[startLine] - state.blkIndent >= 4) return false;
	const first = lineText(state, startLine);
	const dollars = first.startsWith('$$');
	if (!dollars && !first.startsWith('\\[')) return false;
	const opener = first.slice(0, 2);
	const closer = dollars ? '$$' : '\\]';
	const rest = first.slice(2);
	let last = startLine;
	let body = rest;
	if (dollars ? closesInOneLine(rest) : rest.trimEnd().endsWith(closer)) {
		body = rest.trimEnd().slice(0, -2);
	} else {
		last = -1;
		for (let line = startLine + 1; line < endLine; line++) {
			if (state.sCount[line] < state.blkIndent) break;
			const text = lineText(state, line);
			if (text.trim() === '') break;
			if (text.trimEnd().endsWith(closer)) {
				last = line;
				body = `${rest}\n${state.src
					.slice(state.bMarks[startLine + 1] + state.tShift[startLine + 1], state.eMarks[line])
					.trimEnd()
					.slice(0, -2)}`;
				break;
			}
		}
		if (last < 0) return false;
	}
	if (!body.trim()) return false;
	if (silent) return true;
	const token = state.push('math_block', '', 0);
	token.content = body.trim();
	token.markup = opener;
	token.map = [startLine, last + 1];
	state.line = last + 1;
	return true;
}

function failedSource(content: string, markup: string): string {
	const closer = markup === '$$' ? '$$' : markup === '$' ? '$' : markup === '\\(' ? '\\)' : '\\]';
	return `${markup}${content}${closer}`;
}

export function registerMath(md: MarkdownIt): void {
	const { escapeHtml } = md.utils;
	md.inline.ruler.before('escape', 'math_inline', inlineMath);
	md.block.ruler.before('fence', 'math_block', mathBlock, { alt: ['paragraph', 'reference', 'blockquote', 'list'] });
	md.renderer.rules.math_inline = (tokens, idx) => {
		const { content, markup } = tokens[idx];
		const markupHtml = typesetLatex(content);
		if (markupHtml === null) return `<span class="agent-math-failed">${escapeHtml(failedSource(content, markup))}</span>`;
		return `<span class="agent-math" role="math" aria-label="${escapeHtml(content)}">${markupHtml}</span>`;
	};
	md.renderer.rules.math_block = (tokens, idx) => {
		const { content, markup } = tokens[idx];
		const markupHtml = typesetLatex(content);
		if (markupHtml === null) return `<div class="agent-math-failed">${escapeHtml(failedSource(content, markup))}</div>\n`;
		return `<div class="agent-math-block" role="math" aria-label="${escapeHtml(content)}">${markupHtml}</div>\n`;
	};
}
