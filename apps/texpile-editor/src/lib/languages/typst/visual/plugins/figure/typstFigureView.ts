// a typ_figure as typst sets it: the body, then the caption centered under it
import type { Node } from 'prosemirror-model';
import type { NodeView, Decoration } from 'prosemirror-view';
import { PASSES_BODY_SETTINGS } from '$lib/languages/typst/visual/core';
import './typstFigure.css';

// the caption's number as the last compile printed it, handed on the decoration
function captionPrefixOf(decorations: readonly Decoration[]): string {
	const given = decorations.find((d) => Array.isArray(d.spec.numbers));
	return given && typeof given.spec.captionPrefix === 'string' ? given.spec.captionPrefix : '';
}

export function typstFigureView(node: Node, decorations: readonly Decoration[] = []): NodeView {
	const dom = document.createElement('figure');
	dom.className = 'typ-figure';
	dom.setAttribute(PASSES_BODY_SETTINGS, '');
	if (node.attrs.label) dom.dataset.label = String(node.attrs.label);
	function showPrefix(given: readonly Decoration[]): void {
		const prefix = captionPrefixOf(given);
		if (prefix) dom.style.setProperty('--figure-prefix', JSON.stringify(prefix));
		else dom.style.removeProperty('--figure-prefix');
		dom.toggleAttribute('data-printed', !!prefix);
	}
	showPrefix(decorations);
	return {
		dom,
		contentDOM: dom,
		update(next, given) {
			if (next.type !== node.type) return false;
			showPrefix(given);
			return true;
		}
	};
}
