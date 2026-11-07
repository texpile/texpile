// the head a theorem-style let prints before its content (`#let lemma = thmplain("lemma", "Lemma")`), as its maker's
// data says the function it makes prints it
import type { SyntaxNode } from '@lezer/common';
import { argumentText, calleePath, type OwnLet, type TypstEntry } from '../../../knowledge';
import { letParts } from '../../../knowledge/scan/readEntry';
import { partsOf, strValue, textOf } from '../../../knowledge/scan/syntax';
import { readTypstCall } from '../reading/typstCall';
import { escapedMarkup } from './expansion/printedText';
import { drawTypstMarkup } from './markupDrawing';

const GAPS = new Set(['LeftParen', 'RightParen', 'Comma']);
// the editor counts no Typst theorem
const COUNT = / ?\{\.number\}/g;

function argumentMarkup(node: SyntaxNode, source: string): string | null {
	if (node.name === 'Str') return escapedMarkup(strValue(node, source));
	if (node.name === 'ContentBlock') return textOf(node, source).slice(1, -1);
	const text = argumentText(node, source);
	return text === null ? null : escapedMarkup(text);
}

/** the maker's arguments by parameter, when the let gives the ones the data's run gave, and besides them only named
 *  arguments the data says leave the head as it is */
function makerArguments(entry: TypstEntry, args: SyntaxNode, source: string): Map<string, string> | null {
	const given = partsOf(args).filter((a) => !GAPS.has(a.name));
	const keeps = new Set(entry.makes?.headKeeps);
	const positional = given.filter((a) => a.name !== 'Named');
	const required = (entry.params ?? []).filter((p) => p.positional && !p.variadic && p.default === undefined);
	function unknown(a: SyntaxNode): boolean {
		return a.name === 'Spread' || (a.name === 'Named' && !keeps.has(textOf(a.firstChild!, source)));
	}
	if (positional.length !== required.length || given.some(unknown)) return null;
	const out = new Map<string, string>();
	for (const [i, param] of required.entries()) {
		const markup = argumentMarkup(positional[i], source);
		if (markup === null) return null;
		out.set(param.name, markup);
	}
	return out;
}

/** `args`: the call's own arguments as written between its parentheses, null for none; null when the data cannot say
 *  what it prints, or the call gives what the data's run did not (a named argument, a second note) */
export function theoremHead(own: OwnLet | null | undefined, args: string | null): string | null {
	const parts = own ? letParts(own.node, own.source) : null;
	if (!own || !parts?.body || parts.params || parts.body.name !== 'FuncCall') return null;
	const [callee, makerArgs] = partsOf(parts.body);
	const maker = callee ? calleePath(callee, own.source) : null;
	const entry = maker ? own.scope.lookup(maker.join('.'))?.entry : null;
	const values = entry?.makes && makerArgs?.name === 'Args' ? makerArguments(entry, makerArgs, own.source) : null;
	const call = args?.trim() ? readTypstCall(`#note(${args})`) : null;
	if (!entry?.makes || !values || (args?.trim() && (!call || call.args.length !== 1 || call.args[0].name))) return null;
	const note = call ? argumentMarkup(call.args[0].node, call.source) : null;
	const template = call ? entry.makes.printsNoted : entry.makes.prints;
	if (!template || (call && note === null)) return null;
	const [head, after, ...more] = template.replace(COUNT, '').split('{.body}');
	if (after === undefined || after.trim() || more.length) return null;
	if (note !== null) values.set('.note', note);
	const filled = head.replace(/\{([^{}]+)\}/g, (whole, name: string) => values.get(name) ?? whole);
	return /\{[^{}]+\}/.test(filled) ? null : filled.trim();
}

export function drawTheoremHead(markup: string): HTMLElement | null {
	return drawTypstMarkup(markup, () => null)?.dom ?? null;
}

/** an action that shows a drawn head in the element */
export function showTheoremHead(node: HTMLElement, head: HTMLElement) {
	node.replaceChildren(head);
	return { update: (next: HTMLElement) => node.replaceChildren(next) };
}
