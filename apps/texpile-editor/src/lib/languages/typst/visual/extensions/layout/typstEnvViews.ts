// the view of a typ_env: drawn as what it prints when it is a layout call, else the header over its content
import type { Node } from 'prosemirror-model';
import type { EditorView, NodeView } from 'prosemirror-view';
import { typstEnvView } from '../env/typstEnvView.svelte';
import { layoutKindOf } from './layoutDrawing';
import { TypstLayoutView } from './typstLayoutView.svelte';

/** `#[#set text(fill: red); words]`: its words in a box, each rule a setting line among them */
function styledBlockView(): NodeView {
	const dom = document.createElement('div');
	dom.className = 'typ-environment';
	return { dom, contentDOM: dom, update: (next) => next.type.name === 'typ_env' && next.attrs.name === '' };
}

export function typstDrawnEnvView(node: Node, view: EditorView, getPos: () => number | undefined): NodeView {
	if (node.attrs.name === '') return styledBlockView();
	if (layoutKindOf(node)) return new TypstLayoutView(node, view, getPos);
	const header = typstEnvView(node, view, getPos);
	// renamed to a layout call in the header: the view is made again
	return {
		...header,
		update: (next, decorations, inner) =>
			!layoutKindOf(next) && next.attrs.name !== '' && (header.update?.(next, decorations, inner) ?? false)
	};
}
