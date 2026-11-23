// a float's pictures side by side over its caption, as the DOM editor's figureGroup.css drew them
import type { Node as PMNode } from 'prosemirror-model';
import type { Decoration } from 'prosemirror-view';
import type { CanvasNodeViewConstructor, StyleLook } from '$lib/editor/canvas';
import { faceElement, renderFaceSpec, setLook } from '$lib/editor/canvas';
import { floatName } from '$lib/languages/latex/visual/core';

const GROUP_LOOK: StyleLook = { position: 'relative', margin: 'calc(var(--spacing) * 3) 0px' };
const BODY_LOOK: StyleLook = {
	display: 'flex',
	flexWrap: 'wrap',
	alignItems: 'flex-start',
	justifyContent: 'center',
	gap: 'calc(var(--spacing) * 3)'
};
const CAPTION_LOOK: StyleLook = { flexBasis: '100%', textAlign: 'center' };
const PREFIX_LOOK: StyleLook = { fontWeight: '600', color: 'var(--muted-text)', marginRight: '0.25em' };

/** the number each group's decorations hand; its caption builds after it and reads it */
const handedNumbers = new WeakMap<PMNode, string | null>();

function numberOf(decorations: readonly Decoration[]): string | null {
	const numbers = decorations.find((d) => Array.isArray((d.spec as { numbers?: unknown }).numbers))?.spec.numbers as string[] | undefined;
	return numbers?.[0] ?? null;
}

export function figureGroupView(
	...[node, view, , decorations]: Parameters<CanvasNodeViewConstructor>
): ReturnType<CanvasNodeViewConstructor> {
	const { el } = view.canvas.build;
	const dom = el('div', 'figure-group');
	setLook(dom, GROUP_LOOK);
	const body = dom.appendChild(el('div', 'figure-group-body'));
	setLook(body, BODY_LOOK);
	const number = numberOf(decorations);
	handedNumbers.set(node, number);
	return {
		dom,
		contentDOM: body,
		update(next, nextDecorations) {
			if (next.type !== node.type || numberOf(nextDecorations) !== number) return false;
			handedNumbers.set(next, number);
			return true;
		}
	};
}

export function figureGroupCaptionView(
	...[node, view, getPos]: Parameters<CanvasNodeViewConstructor>
): ReturnType<CanvasNodeViewConstructor> {
	const { dom, contentDOM } = renderFaceSpec(node.type.spec.toDOM!(node));
	setLook(dom, CAPTION_LOOK);
	function numberNow(): string | null {
		return handedNumbers.get(view.state.doc.resolve(getPos() ?? 0).parent) ?? null;
	}
	const number = numberNow();
	if (number !== null && !node.attrs.starred) {
		const prefix = faceElement('span', undefined, `${floatName('figure')} ${number}: `);
		prefix.generated = true;
		setLook(prefix, PREFIX_LOOK);
		dom.generatedBefore = prefix;
	}
	return { dom, contentDOM, update: (next) => next.attrs.starred === node.attrs.starred && numberNow() === number };
}
