// what a call is by the data of its name: the open file's scope, else Typst's own
import type { SyntaxNode } from '@lezer/common';
import {
	blockLevelOf,
	calleePath,
	holdsBlock,
	paramFor,
	stdEntry,
	variadicBody,
	type TypstEntry,
	type TypstParam
} from '$lib/languages/typst/knowledge';
import { typstScopeNow } from '../../core/scope/fileScopeNow.svelte';
import { children } from './syntaxUtils';
import { namedKey, namedValue } from './callArgs';

/** `name` or `module.name` as written, null for a callee that is a call or an expression */
export function calleeName(callee: SyntaxNode | null, src: string): string | null {
	return callee ? (calleePath(callee, src)?.join('.') ?? null) : null;
}

/** the entry of the function a call calls; null for one the paper defines or nothing knows */
export function callEntry(call: SyntaxNode, src: string): TypstEntry | null {
	const path = call.name === 'FuncCall' ? calleeName(call.firstChild, src) : null;
	if (!path) return null;
	const scope = typstScopeNow.current;
	return scope ? (scope.lookup(path)?.entry ?? null) : stdEntry(path);
}

function argsOf(call: SyntaxNode): SyntaxNode[] {
	const args = call.lastChild;
	return args?.name === 'Args' ? children(args) : [];
}

/** true when the call is block-level content, false when it is inline, null when nothing says */
export function callLevel(call: SyntaxNode, src: string): boolean | null {
	const entry = callEntry(call, src);
	if (!entry) return null;
	const kids = argsOf(call);
	function named(name: string): string | null {
		const arg = kids.find((k) => k.name === 'Named' && namedKey(k, src) === name);
		const value = arg ? namedValue(arg) : null;
		return value ? src.slice(value.from, value.to) : null;
	}
	const level = blockLevelOf(entry, named);
	if (level === 'content') return kids.some((k) => k.name !== 'Named' && holdsBlock(k, src, typstScopeNow.current));
	return level;
}

/** the parameter the call's body fills: its last positional one */
export function bodyParam(entry: TypstEntry): TypstParam | null {
	const positional = (entry.params ?? []).filter((p) => p.positional && !p.variadic);
	return positional[positional.length - 1] ?? null;
}

/** a call that lays out the content it is given (`align`, `block`, a paper's own theorem) */
export function wrapsContent(call: SyntaxNode, src: string): boolean {
	const entry = callEntry(call, src);
	if (!entry) return true;
	// one inline until its own argument makes it a block (math.equation, raw) is that element, not a box
	const body = bodyParam(entry);
	if (!(body ? body.content : variadicBody(entry)) || (entry.blockParam && entry.block === false)) return false;
	return blockLevelOf(entry, () => null) !== 'content' || callLevel(call, src) === true;
}

/** the parameter a positional argument fills, `index` counting the positional ones before it */
export function positionalParam(call: SyntaxNode, src: string, index: number): TypstParam | null {
	const entry = callEntry(call, src);
	return entry ? paramFor(entry, { index }) : null;
}

/** an element that styles the run of text it is given (`strike`, `smallcaps`, `upper`) */
export function stylesText(entry: TypstEntry): boolean {
	if (blockLevelOf(entry, () => null) !== 'content') return false;
	if (entry.prints !== undefined && entry.prints !== '{body}') return false;
	const body = bodyParam(entry);
	return !!body && (entry.params ?? []).every((p) => p === body || !p.required);
}

/** a rule a table holds between its rows: a package's block-level call that prints nothing (`toprule()`) */
export function drawsRule(item: SyntaxNode, src: string): boolean {
	const path = calleeName(item.name === 'FuncCall' ? item.firstChild : item, src);
	const found = path ? typstScopeNow.current?.lookup(path) : null;
	if (!found || found.origin === 'std') return false;
	const { entry } = found;
	return entry.block === true && entry.prints === '' && !(entry.params ?? []).some((p) => p.content);
}
