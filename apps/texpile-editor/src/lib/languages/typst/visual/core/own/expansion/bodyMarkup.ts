// what an own body prints, as Typst markup with the names it binds written as their values
import type { SyntaxNode } from '@lezer/common';
import { partsOf, strValue, textOf } from '../../../../knowledge/scan/syntax';
import { typstSyntax } from '../../reading/typstCall';
import { literalCode, literalText, type BodyReading, type Binding } from './bindings';
import { knownValue, mayBeNumber } from './literals';
import { escapedMarkup, printedNumber, printedNumeric } from './printedText';
import { chosenBranch, isStyleRule, letBindingOf } from './statements';

const RUNS = new Set([
	'LetBinding',
	'Closure',
	'ForLoop',
	'WhileLoop',
	'Contextual',
	'ModuleImport',
	'ModuleInclude',
	'FuncReturn',
	'Spread',
	'LoopBreak',
	'LoopContinue'
]);
const PLAIN_CODE = new Set([
	'Ident',
	'FieldAccess',
	'FuncCall',
	'ContentBlock',
	'Str',
	'Int',
	'Float',
	'Numeric',
	'Bool',
	'None',
	'Auto',
	'Label',
	'Equation'
]);

/** a literal as markup prints it; undefined for anything else, null for a value past what the editor works out */
function printedLiteral(node: SyntaxNode, source: string): string | null | undefined {
	const text = textOf(node, source);
	switch (node.name) {
		case 'Int':
		case 'Float':
			return printedNumber(Number(text), node.name === 'Int');
		case 'Numeric':
			return printedNumeric(text);
		case 'Bool':
		case 'Auto':
			return text;
		case 'None':
			return '';
		case 'Str':
			return escapedMarkup(strValue(node, source));
		default:
			return undefined;
	}
}

/** `marked`: inside the body's strong or emphasis, where content stays one value so its `*` and `_` pair inside it */
function bindingMarkup(binding: Binding | null, marked: boolean): string | null {
	if (!binding) return '';
	if ('literal' in binding) {
		const text = literalText(binding.literal);
		return text === null ? null : escapedMarkup(text);
	}
	const { node, source, reading } = binding;
	if (reading) {
		const markup = markupOf(node, reading);
		return markup !== null && marked && node.name === 'ContentBlock' ? `#[${markup}]` : markup;
	}
	if (node.name === 'ContentBlock') return marked ? `#${textOf(node, source)}` : textOf(node, source).slice(1, -1);
	const literal = printedLiteral(node, source);
	return literal !== undefined ? literal : `#(${textOf(node, source)})`;
}

function bindingCode(binding: Binding | null): string | null {
	if (!binding) return 'none';
	if ('literal' in binding) return literalCode(binding.literal);
	const text = binding.reading ? writtenWith(binding.node, binding.reading) : textOf(binding.node, binding.source);
	return text === null || PLAIN_CODE.has(binding.node.name) ? text : `(${text})`;
}

/** what a name stands for in math: a string as math text, a number as written */
function bindingMath(binding: Binding | null): string | null {
	const value =
		binding && 'literal' in binding ? binding.literal : binding ? knownValue(binding.node, binding.source, binding.reading) : null;
	if (!value || value === 'content') return null;
	return value.kind === 'str' ? literalCode(value) : value.kind === 'number' ? printedNumber(value.value, value.int) : null;
}

/** a name the body binds, read by name: not a key, nor a field read off something else */
function readsName(node: SyntaxNode, reading: BodyReading): boolean {
	if ((node.name !== 'Ident' && node.name !== 'MathIdent') || !reading.names.has(textOf(node, reading.source))) return false;
	const parent = node.parent;
	if (parent?.name === 'Named' && parent.firstChild?.from === node.from) return false;
	if (parent?.name === 'FieldAccess' && parent.firstChild?.from !== node.from) return false;
	return true;
}

type Edit = { from: number; to: number; text: string };

function hashBefore(node: SyntaxNode): SyntaxNode | null {
	const hash = node.prevSibling;
	return node.parent?.name === 'Markup' && hash?.name === 'Hash' ? hash : null;
}

/** an embedded expression written as `text`, with the `;` that ends it, which Typst does not print; kept when `text`
 *  ends in an expression of its own the `;` keeps apart from what follows */
function embeddedEdit(hash: SyntaxNode, node: SyntaxNode, text: string): Edit {
	const semicolon = node.nextSibling?.name === 'Semicolon' ? node.nextSibling : null;
	const to = semicolon && !endingExpression(text) ? semicolon.to : node.to;
	return { from: hash.from, to, text };
}

/** a statement standing in the text, `#set ..` or `#if ..`: the edit that writes what it prints; null when it has to run */
function statementEdit(node: SyntaxNode, reading: BodyReading): Edit | null {
	const hash = hashBefore(node);
	function edit(markup: string, code: string): Edit {
		return hash ? embeddedEdit(hash, node, markup) : { from: node.from, to: node.to, text: code };
	}
	if (node.name === 'SetRule' || node.name === 'ShowRule') return isStyleRule(node) ? edit('', '') : null;
	if (node.name === 'CodeBlock') {
		const markup = markupOf(node, reading);
		return markup === null ? null : edit(markup, `[${markup}]`);
	}
	const branch = chosenBranch(node, reading);
	if (branch === undefined) return null;
	const markup = branch ? markupOf(branch, reading) : '';
	if (markup === null) return null;
	return edit(markup, branch ? `[${markup}]` : 'none');
}

const STATEMENTS = new Set(['SetRule', 'ShowRule', 'Conditional', 'CodeBlock']);

/** a code block of more than one value, or one that binds or sets */
function isStatements(node: SyntaxNode): boolean {
	const code = node.getChild('Code');
	const parts = code ? partsOf(code) : [];
	return parts.length !== 1 || ['LetBinding', 'SetRule', 'ShowRule', 'Conditional', 'FuncReturn'].includes(parts[0].name);
}

/** the text of `node` with every read of a name the body binds written as its value; null when the body needs running */
export function writtenWith(node: SyntaxNode, reading: BodyReading): string | null {
	const { source } = reading;
	const edits: Edit[] = [];
	let runs = false;
	node.cursor().iterate((n) => {
		if (runs) return false;
		const inner = n.from > node.from || n.to < node.to || n.name !== node.name;
		if (inner && STATEMENTS.has(n.name) && (n.name !== 'CodeBlock' || isStatements(n.node))) {
			const edit = statementEdit(n.node, reading);
			if (edit) edits.push(edit);
			else runs = true;
			return false;
		}
		if (inner && RUNS.has(n.name)) runs = true;
		if (runs || !readsName(n.node, reading)) return !runs;
		const name = textOf(n.node, source);
		if (!reading.bound.has(name)) {
			runs = true;
			return false;
		}
		const binding = reading.bound.get(name) ?? null;
		const parent = n.node.parent;
		const read = parent?.name === 'FieldAccess' || (parent?.name === 'FuncCall' && parent.firstChild?.from === n.from);
		let marked = false;
		for (let p = parent; p && p.from >= node.from; p = p.parent) if (p.name === 'Strong' || p.name === 'Emph') marked = true;
		const hash = hashBefore(n.node);
		const text = n.name === 'MathIdent' ? bindingMath(binding) : hash ? bindingMarkup(binding, marked) : bindingCode(binding);
		if (text === null) runs = true;
		else if (hash) edits.push(embeddedEdit(hash, n.node, text));
		else edits.push({ from: n.from, to: n.to, text: read && !text.startsWith('(') ? `(${text})` : text });
		return false;
	});
	if (runs) return null;
	let text = source.slice(node.from, node.to);
	for (const edit of edits.sort((a, b) => b.from - a.from))
		text = text.slice(0, edit.from - node.from) + edit.text + text.slice(edit.to - node.from);
	return text;
}

// an embedded expression goes on into an argument or a field after it, and a name into letters
const GOES_ON = /^[([]|^\.\p{L}/u;
const NAME_GOES_ON = /^[\p{L}\p{N}_-]/u;

/** the embedded expression markup ends in, `#emph[a]` or `#name` */
function endingExpression(markup: string): SyntaxNode | null {
	const last = markup ? partsOf(typstSyntax(markup)).at(-1) : null;
	return last && last.to === markup.length && last.prevSibling?.name === 'Hash' ? last : null;
}

function goesOn(previous: string, next: string): boolean {
	if (!GOES_ON.test(next) && !NAME_GOES_ON.test(next)) return false;
	const last = endingExpression(previous);
	return !!last && (GOES_ON.test(next) || last.name === 'Ident' || last.name === 'FieldAccess');
}

/** markup with its first character escaped, and the bracket that closes it when it is one */
function escapedStart(markup: string): string {
	if (markup[0] !== '[') return `\\${markup}`;
	let depth = 0;
	for (let i = 0; i < markup.length; i++) {
		if (markup[i] === '\\') i++;
		else if (markup[i] === '[') depth++;
		else if (markup[i] === ']' && --depth === 0) return `\\[${markup.slice(1, i)}\\]${markup.slice(i + 1)}`;
	}
	return `\\${markup}`;
}

/** markup joined as a code block joins its values, an embedded expression kept apart from text that would go on with it */
export function joinedMarkup(parts: string[]): string {
	let out = '';
	let previous = '';
	for (const part of parts.filter(Boolean)) {
		out += previous && goesOn(previous, part) ? escapedStart(part) : part;
		previous = part;
	}
	return out;
}

type StatementsMarkup = { markup: string; returned: boolean };

/** a branch a condition takes, whose `return` ends the body around it */
function branchMarkup(branch: SyntaxNode | null, reading: BodyReading): StatementsMarkup | null {
	if (branch?.name === 'CodeBlock') return statementsMarkup(branch, reading);
	const markup = branch ? markupOf(branch, reading) : '';
	return markup === null ? null : { markup, returned: false };
}

/** the statements of a code block, joined; `returned` when a `return` ended the body */
export function statementsMarkup(block: SyntaxNode, reading: BodyReading): StatementsMarkup | null {
	const code = block.getChild('Code');
	let at = reading;
	const parts: string[] = [];
	for (const s of code ? partsOf(code) : []) {
		if (s.name === 'LetBinding') {
			const bound = letBindingOf(s, at);
			if (!bound) return null;
			at = { ...at, names: new Set([...at.names, bound.name]), bound: new Map([...at.bound, [bound.name, bound.binding]]) };
			continue;
		}
		if (s.name === 'SetRule' || s.name === 'ShowRule') {
			if (!isStyleRule(s)) return null;
			continue;
		}
		if (s.name === 'FuncReturn') {
			const value = partsOf(s)[1];
			const markup = value ? markupOf(value, at) : joinedMarkup(parts);
			return markup === null ? null : { markup, returned: true };
		}
		if (s.name === 'Conditional') {
			const branch = chosenBranch(s, at);
			if (branch === undefined) return null;
			const inner = branchMarkup(branch, at);
			if (!inner || inner.returned) return inner;
			parts.push(inner.markup);
			continue;
		}
		const markup = markupOf(s, at);
		if (markup === null) return null;
		parts.push(markup);
	}
	return { markup: joinedMarkup(parts), returned: false };
}

export function markupOf(node: SyntaxNode, reading: BodyReading): string | null {
	const { source } = reading;
	switch (node.name) {
		case 'ContentBlock': {
			const text = writtenWith(node, reading);
			return text === null ? null : text.slice(1, -1);
		}
		case 'CodeBlock':
			return statementsMarkup(node, reading)?.markup ?? null;
		case 'Parenthesized': {
			const parts = partsOf(node).filter((p) => p.name !== 'LeftParen' && p.name !== 'RightParen');
			return parts.length === 1 ? markupOf(parts[0], reading) : parts.length ? null : '';
		}
		case 'Binary': {
			const known = knownValue(node, source, reading);
			const text = known && known !== 'content' ? literalText(known) : undefined;
			if (text !== undefined) return text === null ? null : escapedMarkup(text);
			const parts = partsOf(node);
			if (
				parts.length !== 3 ||
				textOf(parts[1], source) !== '+' ||
				mayBeNumber(parts[0], source, reading) ||
				mayBeNumber(parts[2], source, reading)
			)
				return null;
			const left = markupOf(parts[0], reading);
			const right = left === null ? null : markupOf(parts[2], reading);
			return right === null ? null : joinedMarkup([left!, right]);
		}
		case 'Conditional': {
			const branch = chosenBranch(node, reading);
			return branch === undefined ? null : branch ? markupOf(branch, reading) : '';
		}
		case 'Equation':
			return writtenWith(node, reading);
		default:
			break;
	}
	if (readsName(node, reading)) {
		const name = textOf(node, source);
		return reading.bound.has(name) ? bindingMarkup(reading.bound.get(name) ?? null, false) : null;
	}
	const literal = printedLiteral(node, source);
	if (literal !== undefined) return literal;
	if (node.name !== 'FuncCall' && node.name !== 'Ident' && node.name !== 'FieldAccess') return null;
	const code = writtenWith(node, reading);
	return code === null ? null : `#${code}`;
}
