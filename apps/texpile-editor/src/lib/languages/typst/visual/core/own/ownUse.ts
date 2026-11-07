// a chip that is one use of the paper's own name, `#ie` or `#definition[..]`
import type { SyntaxNode } from '@lezer/common';
import type { OwnLet, TypstFileScope } from '../../../knowledge';
import { letParts, valueParts, writtenParamsOf, type WrittenParam } from '../../../knowledge/scan/readEntry';
import { strValue } from '../../../knowledge/scan/syntax';
import { readTypstCall, withoutTrailingLabel, type TypstCall } from '../reading/typstCall';
import { valueName } from '../reading/packageUse';

/** an expression as some source wrote it: an argument of the call, or a default of the definition */
export type WrittenValue = { node: SyntaxNode; source: string };

export type OwnUse = {
	name: string;
	own: OwnLet;
	/** null for a use without arguments, `#ie` */
	call: TypstCall | null;
	/** null for a value */
	params: WrittenParam[] | null;
	body: SyntaxNode;
};

export function readOwnUse(source: string, scope: TypstFileScope): OwnUse | null {
	if (!source.startsWith('#')) return null;
	const read = readTypstCall(withoutTrailingLabel(source));
	const keyed = read?.form === 'call' ? keyRead(read) : null;
	const call = keyed ? null : read;
	const name = keyed ?? (call?.form === 'call' ? call.name : call ? null : valueName(source));
	const own = name ? scope.own(name) : null;
	if (!name || !own || (own.madeField && !call?.bodies.length)) return null;
	const parts = own.value ? valueParts(own.value) : letParts(own.node, own.source);
	if (!parts.body) return null;
	const written = parts.params ? writtenParamsOf(parts.params, own.source) : null;
	if (written?.partial) return null;
	const params = written?.params ?? null;
	return { name, own, call, params, body: parts.body };
}

/** `info.at("title")` as the path `info.title`, when the key is a plain string */
function keyRead(call: TypstCall): string | null {
	const at = /^(.*)\.at$/.exec(call.name);
	const [key, ...rest] = call.args;
	const written =
		at && key?.name === null && key.kind === 'Str' && !rest.length && !call.bodies.length ? strValue(key.node, call.source) : null;
	return at && written !== null && !written.includes('.') ? `${at[1]}.${written}` : null;
}

/** what the call gives each parameter; null when the call does not fit the parameters */
export function argumentsOf(use: OwnUse): Map<string, WrittenValue | null> | null {
	const params = use.params ?? [];
	const out = new Map<string, WrittenValue | null>();
	const source = use.call?.source ?? '';
	const given = use.call ? [...use.call.args.filter((a) => a.name === null), ...use.call.bodies] : [];
	const positional = params.filter((p) => p.kind === 'positional');
	const sink = params.find((p) => p.kind === 'variadic');
	if (given.length > positional.length && !sink) return null;
	for (const [i, param] of positional.entries()) {
		if (!given[i]) return null;
		out.set(param.name, { node: given[i].node, source });
	}
	const own = use.own.source;
	for (const param of params) if (param.kind === 'named') out.set(param.name, param.value && { node: param.value, source: own });
	for (const arg of use.call?.args ?? []) {
		if (arg.name === null) continue;
		const param = params.find((p) => p.name === arg.name && p.kind === 'named');
		if (!param && !sink) return null;
		if (param) out.set(param.name, { node: arg.node, source });
	}
	return out;
}
