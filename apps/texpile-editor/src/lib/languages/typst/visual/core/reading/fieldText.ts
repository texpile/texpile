// the text a template's field holds, as its title block prints it
import type { SyntaxNode } from '@lezer/common';
import { argumentText, type TypstFileScope } from '../../../knowledge';
import { unquote } from '../../convert/reading/syntaxUtils';
import { childrenOf } from '../../../knowledge/scan/syntax';
import { readLorem } from './loremCall';
import { loremText } from './loremText';
import { displayDate, makeDate, readToday, type TypstDate } from './typstDate';

/** an author: the name, then what stands under it (an affiliation, an email) */
export type FieldCell = { name: string; lines: string[] };

/** `source` holds the node: the chip's, or the file a variable's let stands in */
export type FieldNode = { node: SyntaxNode; source: string };

const MOST_HOPS = 4;
const WORDS = new Set(['Text', 'Shorthand', 'SmartQuote']);
const NOTHING = new Set(['None', 'Auto']);

const SKIPPED = new Set(['LineComment', 'BlockComment', 'Comma']);
const PUNCTUATION = new Set(['LeftParen', 'RightParen', 'Space', 'Colon']);

/** the children but comments and commas, its spaces kept as markup prints them */
function printedPartsOf(node: SyntaxNode): SyntaxNode[] {
	return childrenOf(node).filter((c) => !SKIPPED.has(c.name));
}

/** the words of markup that is more than words (math, a call, a line break): each piece as it reads */
function wordsOf(node: SyntaxNode, source: string): string {
	if (node.name === 'Equation' || node.name === 'Raw') return source.slice(node.from, node.to);
	if (node.name === 'Space' || node.name === 'Linebreak' || node.name === 'Parbreak') return ' ';
	if (node.name === 'Escape') return source.slice(node.from + 1, node.to);
	if (WORDS.has(node.name)) return source.slice(node.from, node.to);
	// a call's content prints, its other arguments say how
	const kids = node.name === 'Args' ? printedPartsOf(node).filter((k) => k.name === 'ContentBlock') : printedPartsOf(node);
	return kids.map((kid) => wordsOf(kid, source)).join('');
}

/** what a variable names, through the file's lets and the modules it imports */
export function resolveVariable(field: FieldNode, scope: TypstFileScope | null, hops = 0): FieldNode {
	const { node, source } = field;
	if (node.name !== 'Ident' || hops > MOST_HOPS) return field;
	const own = scope?.own(source.slice(node.from, node.to));
	const value = own?.node.lastChild;
	if (!own || !value || own.node.getChild('Closure') || own.node.getChild('Destructuring')) return field;
	return resolveVariable({ node: value, source: own.source }, own.scope, hops + 1);
}

/** `datetime(year: .., month: .., day: ..)`, or a dict of them a template takes for its date */
function readDate(parts: SyntaxNode[], source: string): TypstDate | null {
	const at: Record<string, number> = {};
	for (const named of parts) {
		const key = named.firstChild;
		const value = named.lastChild;
		if (key && value?.name === 'Int') at[source.slice(key.from, key.to)] = Number(source.slice(value.from, value.to));
	}
	if (!('year' in at) || !(at.month >= 1 && at.month <= 12)) return null;
	return makeDate(at.year, at.month, 'day' in at ? at.day : null);
}

/** the date a call makes; `datetime` is Typst's own */
function callDate(call: SyntaxNode, source: string): TypstDate | null {
	const callee = source.slice(call.firstChild!.from, call.firstChild!.to);
	if (callee === 'datetime.today') return readToday();
	if (callee === 'datetime') return readDate(call.getChild('Args')?.getChildren('Named') ?? [], source);
	return null;
}

/** `date.display("[day].[month].[year]")` as its pattern prints the date it is called on */
function displayedText(call: SyntaxNode, source: string): string | null {
	const callee = call.firstChild!;
	const method = callee.name === 'FieldAccess' ? callee.lastChild : null;
	const on = callee.firstChild;
	if (!method || source.slice(method.from, method.to) !== 'display' || on?.name !== 'FuncCall') return null;
	const date = callDate(on, source);
	const args = printedPartsOf(call.getChild('Args')!).filter((k) => k.name !== 'LeftParen' && k.name !== 'RightParen');
	if (!date || args.length > 1 || (args[0] && args[0].name !== 'Str')) return null;
	return displayDate(date, args[0] ? unquote(source.slice(args[0].from, args[0].to)) : undefined);
}

function callText(call: SyntaxNode, source: string): string | null {
	const date = callDate(call, source);
	if (date) return displayDate(date);
	const shown = displayedText(call, source);
	if (shown !== null) return shown;
	const lorem = readLorem(`#${source.slice(call.from, call.to)}`);
	return lorem ? loremText(lorem.words) : null;
}

/** a dict's text: a date, else its values in the order written */
function dictText(dict: SyntaxNode, source: string, scope: TypstFileScope | null): string | null {
	const entries = dict.getChildren('Named');
	const date = readDate(entries, source);
	if (date) return displayDate(date);
	const texts = entries.map((named) => (named.lastChild ? fieldText({ node: named.lastChild, source }, scope) : null));
	return texts.some((text) => text === null) ? null : texts.filter(Boolean).join(' ');
}

/** the field's text; null when it is Typst the block cannot print */
export function fieldText(field: FieldNode, scope: TypstFileScope | null): string | null {
	const { node, source } = resolveVariable(field, scope);
	if (NOTHING.has(node.name)) return '';
	if (node.name === 'Str') return unquote(source.slice(node.from, node.to));
	if (node.name === 'Int' || node.name === 'Float') return source.slice(node.from, node.to);
	if (node.name === 'Dict') return dictText(node, source, scope);
	if (node.name === 'FuncCall' && node.firstChild && node.getChild('Args')) {
		const text = callText(node, source);
		if (text !== null) return text;
	}
	const plain = argumentText(node, source) ?? (node.name === 'ContentBlock' ? wordsOf(node, source) : null);
	return plain === null ? null : plain.replace(/\s+/g, ' ').trim();
}

/** what a list or a dict holds, in order */
function entriesOf(at: FieldNode): FieldNode[] {
	return printedPartsOf(at.node)
		.filter((k) => !PUNCTUATION.has(k.name))
		.map((node) => ({ node, source: at.source }));
}

/** the items of a list field, the names a dict is keyed by (`("Ada": (..), "Alan": (..))`), or the field alone */
export function fieldItems(field: FieldNode, scope: TypstFileScope | null): FieldNode[] {
	const at = resolveVariable(field, scope);
	const keyed = at.node.name === 'Dict' ? at.node.getChildren('Keyed') : [];
	const keys = keyed.map((entry) => entry.firstChild).filter((key) => key?.name === 'Str');
	if (keys.length && keys.length === keyed.length) return keys.map((node) => ({ node: node!, source: at.source }));
	return at.node.name === 'Array' ? entriesOf(at) : [at];
}

/** an author as a cell: a dict's `name`, or else its first text, over the rest of its text; a list read the same.
 *  null when the author is Typst the block cannot print */
export function fieldCell(field: FieldNode, scope: TypstFileScope | null): FieldCell | null {
	const at = resolveVariable(field, scope);
	if (at.node.name !== 'Dict' && at.node.name !== 'Array') {
		const name = fieldText(at, scope);
		return name === null ? null : { name, lines: [] };
	}
	const entries: Array<{ key: string | null; text: string }> = [];
	for (const item of entriesOf(at)) {
		const named = item.node.name === 'Named' ? item.node : null;
		const value = named ? named.lastChild : item.node;
		const text = value && value !== named?.firstChild ? fieldText({ node: value, source: at.source }, scope) : null;
		// a switch or a list (`corresponding: true`, an ORCID) is no line of the cell
		if (text) entries.push({ key: named?.firstChild ? at.source.slice(named.firstChild.from, named.firstChild.to) : null, text });
	}
	const name = entries.find((e) => e.key === 'name') ?? entries[0];
	return { name: name?.text ?? '', lines: entries.filter((e) => e !== name).map((e) => e.text) };
}
