// prosemirror-flat-list's list drawn from its toDOM, with its marker element written from the item's label (the
// listNumbers decoration: a bullet by depth or a number) else its place among the ordered items before it
import type { Node as PMNode } from 'prosemirror-model';
import type { Decoration } from 'prosemirror-view';
import type { CanvasNodeView } from '../contracts/nodeViewTypes';
import type { StyleLook } from '../contracts/styleTypes';
import type { VisualView } from '../contracts/viewTypes';
import { decorationAttrsOf } from '../decorations/decorationAttrs';
import { setLook } from '../tree/faceStyle';
import { renderToDom } from '../views/viewRegistry';
import { generatedPart } from './generatedPart';

// prosemirror-flat-list's style.css under document.css's .prosemirror-flat-list { my-1 leading-relaxed }
const LIST_LOOK: StyleLook = {
	display: 'list-item',
	position: 'relative',
	margin: '4px 0px 4px 32px',
	padding: '0px',
	listStyle: 'none',
	lineHeight: 'var(--leading-relaxed)'
};
const DESCRIPTION_LOOK: StyleLook = { ...LIST_LOOK, marginLeft: '0px', paddingLeft: '32px' };
const DEFAULT_BULLET = '\u2022';
const MARKER_LOOK: StyleLook = { position: 'absolute', right: '100%', fontVariantNumeric: 'tabular-nums' };
// a task's box and a toggle's arrow sit in the gutter, one line height wide (style.css says width: 1lh)
const BOX_MARKER_LOOK: StyleLook = {
	position: 'absolute',
	right: '100%',
	textAlign: 'center',
	width: 'calc(var(--leading-relaxed) * 1em)'
};

function labelOf(decorations: readonly Decoration[]): string | null {
	for (const decoration of decorations) {
		const label = decorationAttrsOf(decoration)['data-item-label'];
		if (label) return label;
	}
	return null;
}

function isOrdered(node: PMNode | null | undefined): boolean {
	return node?.type.name === 'list' && node.attrs.kind === 'ordered';
}

/** the stylesheet's counter: reset by the first of a run of ordered items, set by its order */
function countedLabel(node: PMNode, view: VisualView, pos: number | undefined): string {
	if (pos === undefined) return `${node.attrs.order ?? 1}.`;
	const $pos = view.state.doc.resolve(pos);
	let index = $pos.index();
	let count = 1;
	while (index > 0 && isOrdered($pos.parent.child(index - 1))) {
		index--;
		count++;
	}
	const first = $pos.parent.child(index);
	return `${Number(first.attrs.order ?? 1) + count - 1}.`;
}

export function listNodeView(
	node: PMNode,
	view: VisualView,
	getPos: () => number | undefined,
	decorations: readonly Decoration[]
): CanvasNodeView {
	const { dom, contentDOM } = renderToDom(node, view.canvas.build.checkbox);
	const kind = dom.getAttribute('data-list-kind');
	const described = node.attrs.envName === 'description';
	function markerOf(at: readonly Decoration[], from: PMNode): string | null {
		if (kind === 'ordered') return `${labelOf(at) ?? countedLabel(from, view, getPos())} `;
		return kind === 'bullet' && !described ? `${labelOf(at) ?? DEFAULT_BULLET} ` : null;
	}
	const marker = markerOf(decorations, node);
	setLook(dom, described ? DESCRIPTION_LOOK : LIST_LOOK);
	if (kind === 'task' || kind === 'toggle') for (const box of dom.querySelectorAll('.list-marker')) setLook(box, BOX_MARKER_LOOK);
	if (marker !== null) dom.generatedMarker = generatedPart(marker, MARKER_LOOK);
	const list: CanvasNodeView = {
		dom,
		contentDOM,
		update(next: PMNode, nextDecorations: readonly Decoration[]): boolean {
			if (!next.sameMarkup(node)) return false;
			return markerOf(nextDecorations, next) === marker;
		}
	};
	return list;
}
