// Typst's parse of one equation as a plain tree, for the math editor (which is not CodeMirror
// and has no use for Lezer).
import { TypstSyntax } from '../pkg/texpile_typst_syntax_wasm.js';

/** a node of Typst's syntax tree; `kind` is typst-syntax's SyntaxKind name, offsets are UTF-16 */
export type TypstMathNode = { kind: string; from: number; to: number; children: TypstMathNode[] };

let syntax: TypstSyntax | null = null;

/**
 * The `Math` node of `$src$`, with offsets into `src`. Error nodes are left in the tree for the
 * caller to judge. Whitespace-only source has no Math node, so an empty one stands in at its end.
 */
export function parseTypstMath(src: string): TypstMathNode {
	const text = `$${src}$`;
	if (!syntax) syntax = new TypstSyntax(text);
	else syntax.set_text(text);
	const buffer = syntax.buffer();
	const names = syntax.node_names().split('\n');

	// Tree.build's buffer: [id, from, to, size] per node, children before their parent
	const stack: TypstMathNode[] = [];
	for (let i = 0; i < buffer.length; i += 4) {
		const node: TypstMathNode = { kind: names[buffer[i] - 1], from: buffer[i + 1] - 1, to: buffer[i + 2] - 1, children: [] };
		let entries = buffer[i + 3] / 4 - 1;
		while (entries > 0) {
			const child = stack.pop()!;
			node.children.unshift(child);
			entries -= countNodes(child);
		}
		stack.push(node);
	}
	const math = stack[0]?.children.find((node) => node.kind === 'Math');
	return math ?? { kind: 'Math', from: src.length, to: src.length, children: [] };
}

function countNodes(node: TypstMathNode): number {
	return node.children.reduce((sum, child) => sum + countNodes(child), 1);
}

/** true when Typst reports a syntax error anywhere under `node` */
export function hasTypstError(node: TypstMathNode): boolean {
	return node.kind === 'Error' || node.children.some(hasTypstError);
}
