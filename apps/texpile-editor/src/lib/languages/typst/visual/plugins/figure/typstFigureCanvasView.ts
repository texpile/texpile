// a typ_figure as typst sets it: the body, then the caption centered under it, after the number the last compile printed
import type { Node as PMNode } from 'prosemirror-model';
import type { Decoration } from 'prosemirror-view';
import type { CanvasNodeViewConstructor, CanvasViewSet, StyleLook } from '$lib/editor/canvas';
import { generatedPart, setLook } from '$lib/editor/canvas';

const FIGURE_LOOK: StyleLook = { margin: 'calc(var(--spacing) * 3) 0', display: 'flow-root' };
const CAPTION_LOOK: StyleLook = { marginTop: 'calc(var(--spacing) * 2)', textAlign: 'center' };
const PREFIX_LOOK: StyleLook = { fontWeight: '600', color: 'var(--muted-text)', marginRight: '0.25em' };

// the caption's number as the last compile printed it, handed on the figure's decoration
function captionPrefixOf(decorations: readonly Decoration[]): string {
	const given = decorations.find((d) => Array.isArray((d.spec as { numbers?: unknown }).numbers));
	const prefix = (given?.spec as { captionPrefix?: unknown } | undefined)?.captionPrefix;
	return typeof prefix === 'string' ? prefix : '';
}

// the figure hands its number to the caption it builds: asking the view for decorations mid-build builds the block again
const prefixes = new WeakMap<PMNode, string>();

function figureView(...[node, view, , decorations]: Parameters<CanvasNodeViewConstructor>): ReturnType<CanvasNodeViewConstructor> {
	const dom = view.canvas.build.el('figure', 'typ-figure');
	setLook(dom, FIGURE_LOOK);
	if (node.attrs.label) dom.setAttribute('data-label', String(node.attrs.label));
	const prefix = captionPrefixOf(decorations);
	prefixes.set(node, prefix);
	// a new number builds the caption again, which draws it
	return { dom, contentDOM: dom, update: (next, given) => next.type === node.type && captionPrefixOf(given) === prefix };
}

function captionView(...[, view, getPos]: Parameters<CanvasNodeViewConstructor>): ReturnType<CanvasNodeViewConstructor> {
	const dom = view.canvas.build.el('figcaption', 'typ-figure-caption');
	setLook(dom, CAPTION_LOOK);
	const pos = getPos();
	const figure = pos === undefined ? null : view.state.doc.resolve(pos);
	const prefix = figure && figure.depth ? (prefixes.get(figure.parent) ?? '') : '';
	if (prefix) dom.generatedBefore = generatedPart(prefix, PREFIX_LOOK);
	return { dom, contentDOM: dom };
}

export function typstFigureViews(): CanvasViewSet {
	return {
		nodeViews: { typ_figure: figureView, typ_figure_caption: captionView },
		// a figure only wraps its body: the gear opens the body's settings, as a grid of pictures has
		blockSettings: { typ_figure: { passesBodySettings: true, label: () => '', open: () => {} } }
	};
}
