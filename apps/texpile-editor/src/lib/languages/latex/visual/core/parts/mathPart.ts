// math inside a chip, typeset as the editor's own math nodes are; a display stands on a line of its own
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

/** the body of a display environment as one formula, or null when the environment holds no display math */
export function environmentMath(name: string, body: string): Math | null {
	const facts = commonEnvFacts(name);
	if (facts.body !== 'math-display') return null;
	// a label names the equation, a \nonumber takes its number away, and neither prints; a comment is not math
	const latex = body
		.replace(/\\label\s*\{[^{}]*\}|\\(?:nonumber|notag)(?![a-zA-Z])|(?<!\\)%[^\n]*/g, '')
		// a row break ending the body ends no row (LyX writes one before a commented-out line)
		.replace(/\\\\\s*$/, '');
	// rows and columns typeset inside the inner environment the editor's formulas use for them
	const inner = facts.cells ? 'aligned' : facts.rows ? 'gathered' : null;
	return { latex: inner ? `\\begin{${inner}}${latex}\\end{${inner}}` : latex, block: true };
}

/** the math a node holds and whether it is displayed, or null for a node that is no math */
function mathOf(src: string, node: SyntaxNode): Math | null {
	const body = bodyOf(node);
	if (INLINE.has(node.name) || DISPLAY.has(node.name)) return { latex: src.slice(body.from, body.to), block: DISPLAY.has(node.name) };
	if (node.name !== 'Environment' || !node.firstChild) return null;
	return environmentMath(environmentName(src, node.firstChild), src.slice(body.from, body.to));
}

/** math the typesetter would draw as its own error marks (an \xymatrix) stays source; the paper's own macros it is handed */
function typesets(latex: string): boolean {
	return validateLatex(latex).every(
		(e) => e.code === 'unknown-command' && !!e.arg && ownMacroDefinition(e.arg.replace(/^\\/, '')) !== null
	);
}

/** a command the typesetter does not know that prints nothing in a formula: \protect, a rule between rows (\hline) */
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

/** a chip that opens with math, worth reading for it */
export function opensWithMath(source: string): boolean {
	const m = /^\s*(?:\$|\\\[|\\\(|\\begin\s*\{([^}]*)\})/.exec(source);
	return !!m && (m[1] === undefined || commonEnvFacts(m[1]).body === 'math-display');
}
