import type { SyntaxNode, Tree } from '@lezer/common';

export function setRulesOf(tree: Tree, src: string, name: string): SyntaxNode[] {
	const out: SyntaxNode[] = [];
	tree.iterate({
		enter: (n) => {
			if (n.name !== 'SetRule') return;
			const target = n.node.getChild('Ident');
			if (target && src.slice(target.from, target.to) === name) out.push(n.node);
		}
	});
	return out;
}

/** a rule as written, its `#` included */
export function writtenRule(rule: SyntaxNode, src: string): string {
	return src.slice(src[rule.from - 1] === '#' ? rule.from - 1 : rule.from, rule.to);
}
