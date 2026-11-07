// a float's caption as the paper prints it, "Algorithm 2: ...", over the float's body
import { compiledNumbersOf, floatName } from '$lib/languages/latex/visual/core';
import type { Node } from 'prosemirror-model';
import type { Decoration, NodeView } from 'prosemirror-view';

import './floatCaption.css';

export function floatCaptionView(node: Node, _view: unknown, _getPos: unknown, decorations: readonly Decoration[] = []): NodeView {
	let currentNode = node;
	const dom = document.createElement('div');
	dom.className = 'float-caption';
	const head = document.createElement('span');
	head.className = 'float-caption-head';
	head.contentEditable = 'false';
	const text = document.createElement('span');
	text.className = 'float-caption-text';
	dom.append(head, text);

	function drawHead(given: readonly Decoration[]): void {
		const number = compiledNumbersOf(given)?.[0];
		const float = String(currentNode.attrs.float);
		head.textContent = currentNode.attrs.starred ? '' : `${floatName(float)}${number ? ` ${number}` : ''}: `;
	}
	drawHead(decorations);

	return {
		dom,
		contentDOM: text,
		update(newNode, newDecorations) {
			if (newNode.type !== currentNode.type) return false;
			currentNode = newNode;
			drawHead(newDecorations);
			return true;
		},
		ignoreMutation: (mutation) => head.contains(mutation.target)
	};
}
