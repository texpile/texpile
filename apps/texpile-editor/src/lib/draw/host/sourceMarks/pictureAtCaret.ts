import { syntaxTree } from '@codemirror/language';
import type { EditorState } from '@codemirror/state';
import type { SyntaxNode, Tree } from '@lezer/common';
import { isPicture, spanOf } from '../anchor/pictureTree';

function isLatexPicture(state: EditorState, node: SyntaxNode): boolean {
	return node.name === 'Environment' && !!node.firstChild && isPicture(spanOf(state.sliceDoc(0, node.firstChild.to), node));
}

function isCanvasCall(state: EditorState, node: SyntaxNode): boolean {
	const callee = node.name === 'FuncCall' ? node.firstChild : null;
	if (!callee) return false;
	const name = state.sliceDoc(callee.from, callee.to);
	return callee.name === 'Ident' ? name === 'canvas' : callee.name === 'FieldAccess' && name.endsWith('.canvas');
}

export function pictureStartAt(state: EditorState, pos: number, typst: boolean, tree: Tree = syntaxTree(state)): number | null {
	const isPictureNode = typst ? isCanvasCall : isLatexPicture;
	// the caret just before \begin or just after \end is at the picture too
	for (const side of [1, -1] as const) {
		let start: number | null = null;
		for (let n: SyntaxNode | null = tree.resolveInner(pos, side); n; n = n.parent) if (isPictureNode(state, n)) start = n.from;
		if (start !== null) return start;
	}
	return null;
}
