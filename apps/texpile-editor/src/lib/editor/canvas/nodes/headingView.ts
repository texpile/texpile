// a heading drawn from its toDOM with its number before it, the one its node decoration hands (numbers plugins)
import type { Node as PMNode } from 'prosemirror-model';
import type { Decoration } from 'prosemirror-view';
import type { CanvasNodeView } from '../contracts/nodeViewTypes';
import type { VisualView } from '../contracts/viewTypes';
import { headingNumberLook } from '../style/base/coreNodeLooks';
import { decorationAttrsOf } from '../decorations/decorationAttrs';
import { renderToDom } from '../views/viewRegistry';
import { generatedPart } from './generatedPart';

function numberOf(decorations: readonly Decoration[]): string | null {
	for (const decoration of decorations) {
		const number = decorationAttrsOf(decoration)['data-number'];
		if (number) return number;
	}
	return null;
}

export function headingNodeView(
	node: PMNode,
	view: VisualView,
	_getPos: () => number | undefined,
	decorations: readonly Decoration[]
): CanvasNodeView {
	const { dom, contentDOM } = renderToDom(node, view.canvas.build.checkbox);
	const number = numberOf(decorations);
	const level = node.attrs.level as number;
	if (number) dom.generatedBefore = generatedPart(number, headingNodeNumberLook(level));
	const heading: CanvasNodeView = {
		dom,
		contentDOM,
		update: (next: PMNode, nextDecorations: readonly Decoration[]) => next.sameMarkup(node) && numberOf(nextDecorations) === number
	};
	return heading;
}

const numberLooks = new Map<number, ReturnType<typeof headingNumberLook>>();

function headingNodeNumberLook(level: number): ReturnType<typeof headingNumberLook> {
	let look = numberLooks.get(level);
	if (!look) numberLooks.set(level, (look = headingNumberLook(level)));
	return look;
}
