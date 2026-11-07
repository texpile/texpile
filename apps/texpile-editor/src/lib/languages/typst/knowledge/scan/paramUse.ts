// what a function does with its parameters, read from its body: one set as text, made a label, cited, linked, or
// handed to another function of the package that does one of these
import type { SyntaxNode } from '@lezer/common';
import { stdEntry } from '../stdLibrary';
import type { TypstArgRole, TypstParam } from '../types';
import { partsOf, textOf } from './syntax';

/** the role the package's own function `name` gives the argument at `place`, when it is one of the package's */
export type OwnRole = (name: string, place: { index: number } | { name: string }) => TypstArgRole | null;

function positionalArgs(call: SyntaxNode): SyntaxNode[] {
	const args = call.getChild('Args');
	return args ? partsOf(args).filter((a) => !['LeftParen', 'RightParen', 'Comma', 'Named', 'Spread'].includes(a.name)) : [];
}

function calleeName(call: SyntaxNode, source: string): string | null {
	const callee = call.firstChild;
	return callee?.name === 'Ident' ? textOf(callee, source) : null;
}

/** the role a use of a parameter gives it: `label(p)`, `cite(label(p))`, `link(p)`, `#p` in markup, `strong(p)` */
function roleOfUse(ident: SyntaxNode, source: string, own: OwnRole): TypstArgRole | null {
	const parent = ident.parent;
	if (parent?.name === 'Markup') return 'text';
	const named = parent?.name === 'Named' && parent.lastChild?.from === ident.from ? parent : null;
	const args = named ? named.parent : parent;
	if (args?.name !== 'Args') return null;
	const call = args.parent;
	if (!call || call.name !== 'FuncCall') return null;
	const name = calleeName(call, source);
	if (named) {
		const key = named.firstChild;
		return name && key?.name === 'Ident' ? own(name, { name: textOf(key, source) }) : null;
	}
	const at = positionalArgs(call).findIndex((a) => a.from === ident.from);
	if (at < 0) return null;
	if (name === 'label') {
		const outer = call.parent?.name === 'Args' ? call.parent.parent : null;
		return outer && calleeName(outer, source) === 'cite' ? 'citekey' : 'label';
	}
	if (name === 'link' && at === 0) return 'url';
	const std = name ? stdEntry(name) : null;
	if (!std) return name ? own(name, { index: at }) : null;
	const positional = std.params?.filter((p) => p.positional) ?? [];
	const param = positional[at] ?? (positional[positional.length - 1]?.variadic ? positional[positional.length - 1] : undefined);
	return param?.content ? 'text' : null;
}

export function argumentRoles(
	body: SyntaxNode,
	source: string,
	params: TypstParam[],
	own: OwnRole = () => null
): Array<[string, TypstArgRole]> {
	const names = new Set(params.map((p) => p.name));
	const out: Array<[string, TypstArgRole]> = [];
	body.cursor().iterate((n) => {
		if (n.name !== 'Ident') return;
		const name = textOf(n.node, source);
		if (!names.has(name)) return;
		const role = roleOfUse(n.node, source, own);
		if (role) out.push([name, role]);
	});
	// a key that is cited or made a label says more than a body that also prints it
	return out.sort((a, b) => Number(a[1] === 'text') - Number(b[1] === 'text'));
}
