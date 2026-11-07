import type { SyntaxNode } from '@lezer/common';
import { validateLatex } from 'mathlive';
import { renderStaticMath } from '$lib/editor/visual/extensions/mathlivebridge/mathStatic';
import type { ChipFace } from '$lib/editor/visual/extensions/drawnChips/chipFace';
import { commonEnvFacts } from '$lib/languages/latex/knowledge/environments/envFacts';
import { commonFacts } from '$lib/languages/latex/knowledge/commands/commandFacts';
import { commonCommand } from '$lib/languages/latex/knowledge/calls/commandCalls';
import { bodyOf, environmentName } from '$lib/languages/latex/parser/tree/walk/stretch';
import { ownMacroDefinition } from '../own/ownMacroFace.svelte';

const INLINE = new Set(['InlineMath', 'ParenMath']);
const DISPLAY = new Set(['DisplayMath', 'BracketMath']);

type Math = { latex: string; block: boolean };

export function environmentMath(name: string, body: string): Math | null {
	const facts = commonEnvFacts(name);
	if (facts.body !== 'math-display') return null;
	const latex = body
		.replace(/\\label\s*\{[^{}]*\}|\\(?:nonumber|notag)(?![a-zA-Z])|(?<!\\)%[^\n]*/g, '')
		// a row break ending the body ends no row (LyX writes one before a commented-out line)
		.replace(/\\\\\s*$/, '');
	const inner = facts.cells ? 'aligned' : facts.rows ? 'gathered' : null;
	return { latex: inner ? `\\begin{${inner}}${latex}\\end{${inner}}` : latex, block: true };
}

function mathOf(src: string, node: SyntaxNode): Math | null {
	const body = bodyOf(node);
	if (INLINE.has(node.name) || DISPLAY.has(node.name)) return { latex: src.slice(body.from, body.to), block: DISPLAY.has(node.name) };
	if (node.name !== 'Environment' || !node.firstChild) return null;
	return environmentMath(environmentName(src, node.firstChild), src.slice(body.from, body.to));
}

function typesets(latex: string): boolean {
	return validateLatex(latex).every(
		(e) => e.code === 'unknown-command' && !!e.arg && ownMacroDefinition(e.arg.replace(/^\\/, '')) !== null
	);
}

function printsNothingHere(command: string): boolean {
	const name = command.replace(/^\\/, '');
	const facts = commonFacts(name);
	return commonCommand(name)?.args.length === 0 && (facts.prints === '' || !!facts.betweenRows);
}

function withoutUnprinted(latex: string): string {
	const unprinted = new Set(
		validateLatex(latex).flatMap((e) => (e.code === 'unknown-command' && e.arg && printsNothingHere(e.arg) ? [e.arg] : []))
	);
	return unprinted.size ? latex.replace(/\\[a-zA-Z@]+(?![a-zA-Z@])/g, (word) => (unprinted.has(word) ? '' : word)) : latex;
}

export function mathFace(math: Math | null): ChipFace | null {
	const latex = math ? withoutUnprinted(math.latex).trim() : '';
	if (!math || !latex || !typesets(latex)) return null;
	return { dom: renderStaticMath(latex, math.block), line: math.block };
}

export function mathPart(src: string, node: SyntaxNode): ChipFace | null {
	return mathFace(mathOf(src, node));
}

export function opensWithMath(source: string): boolean {
	const m = /^\s*(?:\$|\\\[|\\\(|\\begin\s*\{([^}]*)\})/.exec(source);
	return !!m && (m[1] === undefined || commonEnvFacts(m[1]).body === 'math-display');
}
