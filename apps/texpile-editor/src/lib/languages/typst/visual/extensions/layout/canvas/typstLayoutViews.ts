// a Typst layout call drawn as what it prints: the call's style on the box, its body's style on the content
import type { CanvasNodeViewConstructor, CanvasViewSet, StyleLook } from '$lib/editor/canvas';
import { knownLook, renderToDom, setLook } from '$lib/editor/canvas';
import { layoutDrawing, layoutKindOf, type LayoutKind } from '../layoutDrawing';
import { addGridCell, removeGridCell } from '../gridCells';
import { LAYOUT_SETTINGS } from './layoutSettingsOffer';
import { isTypstEnvironment } from '../../env/typstEnvHead';
import { typstEnvView } from '../../env/typstEnvNodeView';
import TypstLayoutGearOverlay from './TypstLayoutGearOverlay.svelte';

const LAYOUT_LOOK: StyleLook = { position: 'relative', margin: 'calc(var(--spacing) * 3) 0' };
const ATTRIBUTION_LOOK: StyleLook = {
	paddingLeft: '1.5em',
	paddingRight: '1.5em',
	textAlign: 'right',
	color: 'var(--muted-text)',
	userSelect: 'none'
};
const KIND_LOOKS: Partial<Record<LayoutKind, StyleLook>> = { box: { width: 'fit-content', maxWidth: '100%' } };
const BODY_LOOKS: Partial<Record<LayoutKind, StyleLook>> = {
	columns: { columnFill: 'balance' },
	quote: { paddingLeft: '1.5em', paddingRight: '1.5em' },
	grid: { display: 'grid', justifyContent: 'start' }
};

function layoutView(
	...[node, view, getPos, decorations, inner]: Parameters<CanvasNodeViewConstructor>
): ReturnType<CanvasNodeViewConstructor> {
	const kind = layoutKindOf(node);
	if (!kind)
		return isTypstEnvironment(node) ? typstEnvView(node, view, getPos, decorations, inner) : renderToDom(node, view.canvas.build.checkbox);
	const drawing = layoutDrawing(kind, node);
	const dom = view.canvas.build.el('div', 'typ-layout');
	dom.setAttribute('data-layout', kind);
	setLook(dom, { ...LAYOUT_LOOK, ...KIND_LOOKS[kind], ...knownLook(drawing.style) });
	const body = view.canvas.build.el('div', 'typ-layout-body');
	setLook(body, { ...BODY_LOOKS[kind], ...knownLook(drawing.bodyStyle) });
	dom.appendChild(body);
	if (drawing.attribution)
		setLook(dom.appendChild(view.canvas.build.el('div', 'typ-layout-attribution', `- ${drawing.attribution}`)), ATTRIBUTION_LOOK);
	let cells = kind === 'grid' ? node.childCount : null;
	function withPos(act: (pos: number) => void): void {
		const pos = getPos();
		if (pos !== undefined) act(pos);
	}
	const gear = {
		onopen: (at: DOMRect) => withPos((pos) => LAYOUT_SETTINGS.open(pos, view, at)),
		onadd: () => withPos((pos) => addGridCell(view, pos)),
		onremove: () => withPos((pos) => removeGridCell(view, pos))
	};
	return {
		dom,
		contentDOM: body,
		update(next) {
			if (next.type !== node.type || layoutKindOf(next) !== kind || JSON.stringify(layoutDrawing(kind, next)) !== JSON.stringify(drawing))
				return false;
			cells = kind === 'grid' ? next.childCount : null;
			return true;
		},
		overlays: (ui) =>
			ui.readOnly
				? []
				: [
						{
							key: 'gear',
							component: TypstLayoutGearOverlay,
							props: { ...gear, cells },
							anchor: {},
							placement: 'inFlow',
							when: 'hoveredOrCaretInside'
						}
					]
	};
}

export function typstLayoutViews(): CanvasViewSet {
	return {
		nodeViews: { typ_env: layoutView, typ_grid: layoutView },
		blockSettings: { typ_env: LAYOUT_SETTINGS, typ_grid: LAYOUT_SETTINGS }
	};
}
