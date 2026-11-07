// a call that prints nothing (`#metadata(none)`, `#counter(page).update(1)`) or a citation that is not printed
// (`#cite(<key>, form: none)`)
import type { SyntaxNode } from '@lezer/common';
import { childrenOf, hasSyntaxError, textOf } from '$lib/languages/typst/knowledge/scan/syntax';
import {
	unquote,
	namedArg,
	positionalArgs,
	typstSyntax,
	nameElement,
	readStdUse,
	stdEntryOf
} from '$lib/languages/typst/visual/core/document';

const QUIET = new Set(['Space', 'LineComment', 'BlockComment', 'Semicolon']);

function oneLine(text: string): string {
	return text.replace(/\s+/g, ' ').trim();
}

/** `counter(page).update(1)`: the call that makes the value, and the method called on it */
function methodCall(written: string): { maker: SyntaxNode; method: string; args: string } | null {
	if (!written.includes(').')) return null;
	const top = typstSyntax(written);
	if (hasSyntaxError(top)) return null;
	const kids = childrenOf(top).filter((k) => !QUIET.has(k.name));
	const call = kids.length === 2 && kids[0].name === 'Hash' && kids[1].name === 'FuncCall' ? kids[1] : null;
	const callee = call?.firstChild;
	const maker = callee?.name === 'FieldAccess' ? callee.firstChild : null;
	const method = callee?.lastChild;
	const args = call?.getChild('Args');
	if (!maker || maker.name !== 'FuncCall' || method?.name !== 'Ident' || !args) return null;
	return { maker, method: textOf(method, written), args: textOf(args, written) };
}

export type QuietCall = { kind: 'row'; target: string; values: string[] } | { kind: 'cite'; key: string };

function invisibleMethod(written: string): QuietCall | null {
	const read = methodCall(written);
	const name = read?.maker.firstChild ? textOf(read.maker.firstChild, written) : '';
	const entry = read && stdEntryOf(name, written);
	if (!read || !entry?.scope || !Object.hasOwn(entry.scope, read.method) || !entry.scope[read.method].invisible) return null;
	const made = oneLine(textOf(read.maker.getChild('Args')!, written)).replace(/^\(|\)$/g, '');
	return { kind: 'row', target: nameElement(name), values: [made, `${read.method}${oneLine(read.args)}`] };
}

/** the key a citation names: `<key>` or `label("key")` */
function citedKey(value: string, kind: string): string | null {
	if (kind === 'Label') return value.slice(1, -1);
	const made = /^label\(\s*("(?:[^"\\]|\\.)*")\s*\)$/.exec(value);
	return made ? unquote(made[1]) : null;
}

function hiddenCite(written: string): QuietCall | null {
	const use = readStdUse(written);
	const form = use ? namedArg(use.call, 'form') : null;
	const param = use?.entry.params?.find((p) => p.name === 'form');
	if (!use || !form || form.kind !== 'None' || !param?.types?.includes('none')) return null;
	const [key] = positionalArgs(use.call);
	const name = key ? citedKey(key.value, key.kind) : null;
	return name ? { kind: 'cite', key: name } : null;
}

/** a call that prints nothing, or a citation that is not printed */
export function readQuiet(source: string): QuietCall | null {
	const written = source.trim();
	const use = readStdUse(written);
	if (use?.entry.invisible) {
		const args = oneLine(written.slice((use.call.open ?? written.length) + 1, use.call.close ?? 0));
		return { kind: 'row', target: nameElement(use.call.name), values: [args] };
	}
	return hiddenCite(written) ?? invisibleMethod(written);
}
