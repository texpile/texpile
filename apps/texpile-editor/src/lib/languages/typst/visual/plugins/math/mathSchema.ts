// the shared math nodes as Typst writes them
import type { NodeSpec, Node as PMNode } from 'prosemirror-model';
import type { TypstSchemaSpec } from '$lib/languages/typst/visual/core/document';

// math nodes hold the equation's Typst, which MathLive reads and writes as Typst; their HTML says
// so, for a paste into a LaTeX document to rewrite it (see pastedMath.ts)
const inlineMathDom: NodeSpec = {
	mathSyntax: 'typst',
	toDOM: () => ['span', { class: 'inline-math', 'data-math-syntax': 'typst' }, 0]
};
const blockMathDom: NodeSpec = {
	mathSyntax: 'typst',
	toDOM: (node: PMNode) => ['div', { class: 'block-math', 'data-label': node.attrs.label, 'data-math-syntax': 'typst' }, 0]
};

export function mathSchema({ nodes, marks }: TypstSchemaSpec): TypstSchemaSpec {
	const inline = nodes.get('inline_math')!;
	const block = nodes.get('block_math')!;
	// typEquation: the call an equation is written as and the bytes around its formula, null for `$ x $`.
	// labelGap: the bytes the source put between the equation and its <label> when they held a line end
	const attrs = { ...block.attrs, typEquation: { default: null }, labelGap: { default: null } };
	return {
		nodes: nodes.update('inline_math', { ...inline, ...inlineMathDom }).update('block_math', { ...block, attrs, ...blockMathDom }),
		marks
	};
}
