// the named parameters of the call around the caret that its arguments do not write yet, which Insert offers
import type { SyntaxNode } from '@lezer/common';
import type { Node } from 'prosemirror-model';
import type { EditorState } from 'prosemirror-state';
import type { CaretArgument } from '$lib/editor/visual/insert/insertItem';
import { readOwnFunctionParams, type TypstFileScope, type TypstParam } from '$lib/languages/typst/knowledge';
import { childrenOf, textOf, typstTop } from '$lib/languages/typst/knowledge/scan/syntax';

function paramsOf(name: string, scope: TypstFileScope): TypstParam[] {
	const own = scope.own(name);
	if (own) return readOwnFunctionParams(own.node, own.source) ?? [];
	return scope.lookup(name)?.entry.params ?? [];
}

/** the names the arguments text gives, read as the arguments of a call */
function writtenNames(args: string): Set<string> {
	const source = `#f(${args})`;
	let list: SyntaxNode | null = null;
	typstTop(source)
		.cursor()
		.iterate((n) => {
			if (n.name === 'Args' && !list) list = n.node;
			return !list;
		});
	const named = (list ? childrenOf(list) : []).flatMap((n) => (n.name === 'Named' && n.firstChild ? [textOf(n.firstChild, source)] : []));
	return new Set(named);
}

function valueOf(param: TypstParam): string {
	return param.content ? '[]' : (param.default ?? 'none');
}

function argumentsOf(node: Node, scope: TypstFileScope): Array<{ name: string; written: string }> {
	const args = typeof node.attrs.args === 'string' ? node.attrs.args : '';
	const have = writtenNames(args);
	return paramsOf(String(node.attrs.name ?? ''), scope)
		.filter((p) => p.named && !p.variadic && !have.has(p.name))
		.map((p) => ({ name: p.name, written: `${p.name}: ${valueOf(p)}` }));
}

/** the arguments of the environments around the caret, innermost first */
export function typstArgumentsAt(state: EditorState, scope: TypstFileScope | null): CaretArgument[] {
	if (!scope) return [];
	const { $from } = state.selection;
	const out: CaretArgument[] = [];
	for (let depth = $from.depth; depth > 0; depth--) {
		const node = $from.node(depth);
		if (node.type.name !== 'typ_env') continue;
		const pos = $from.before(depth);
		for (const { name, written } of argumentsOf(node, scope))
			out.push({
				id: `${depth}:${name}`,
				label: name,
				asks: false,
				run: () => (st, dispatch) => {
					const at = st.doc.nodeAt(pos);
					if (at?.type.name !== 'typ_env') return false;
					const args = typeof at.attrs.args === 'string' ? at.attrs.args.trimEnd().replace(/,$/, '') : '';
					dispatch?.(st.tr.setNodeMarkup(pos, undefined, { ...at.attrs, args: args ? `${args}, ${written}` : written }));
					return true;
				}
			});
	}
	return out;
}
