// where a function sends the named arguments its variadic parameter takes, read from its body
import type { SyntaxNode } from '@lezer/common';
import type { TypstParam } from '../types';
import { calleePath, type ResolvedName } from './scanNames';
import { textOf } from './syntax';

/** a variadic parameter spread into a call of one of Typst's (`block(..blockargs.named())`) takes that function's named arguments */
export function setParamSinks(params: TypstParam[], body: SyntaxNode, source: string, resolve: (name: string) => ResolvedName): void {
	const sinks = params.filter((p) => p.variadic);
	if (!sinks.length) return;
	body.cursor().iterate((n) => {
		if (n.name !== 'Spread') return;
		const call = n.node.parent?.parent;
		const callee = call?.name === 'FuncCall' ? call.firstChild : null;
		const path = callee ? calleePath(callee, source) : null;
		if (!path || resolve(path[0])?.kind !== 'std') return;
		const mentioned = new Set<string>();
		n.node.cursor().iterate((m) => {
			if (m.name === 'Ident') mentioned.add(textOf(m.node, source));
		});
		for (const sink of sinks) if (mentioned.has(sink.name)) sink.into ??= path.join('.');
	});
}
