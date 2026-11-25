// a placeholder command drawn as app.css's .latex-placeholder: \maketitle and the lists as their label, \today as its date
import type { Node as PMNode } from 'prosemirror-model';
import { setLook, type CanvasEvent, type CanvasNodeView, type StyleLook, type VisualView } from '$lib/editor/canvas';
import { openDrawnChip } from '../drawnChips/drawnChipView';
import { inlinePlaceholder } from './inlinePlaceholderView';
import { placeholderCommand } from './placeholderView';

const BLOCK_LOOK: StyleLook = {
	textAlign: 'center',
	fontSize: '0.7rem',
	letterSpacing: '0.06em',
	textTransform: 'uppercase',
	color: 'var(--faint-text)',
	userSelect: 'none',
	cursor: 'pointer',
	padding: '0.2rem 0px',
	margin: 'calc(var(--spacing) * 2) 0px',
	borderRadius: 'var(--radius-base)'
};
const INLINE_LOOK: StyleLook = {
	userSelect: 'none',
	cursor: 'pointer',
	borderBottom: 'var(--default-border-width) dotted var(--faint-text)'
};
const SELECTED_LOOK: StyleLook = { outline: '2px solid var(--color-primary-500)' };
const INLINE_SELECTED_LOOK: StyleLook = { ...SELECTED_LOOK, borderRadius: 'var(--radius-base)', outlineOffset: '1px' };

function pressed(event: CanvasEvent): boolean {
	return event.type === 'mousedown' && 'button' in event && event.button === 0;
}

export function placeholderChipView(node: PMNode, block: boolean, view: VisualView, getPos: () => number | undefined): CanvasNodeView {
	const { el } = view.canvas.build;
	const source = node.textContent;
	const dom = block
		? el('div', 'latex-placeholder', placeholderCommand(source)?.label ?? '')
		: el('span', 'latex-placeholder-inline', inlinePlaceholder(source) ?? '');
	setLook(dom, block ? BLOCK_LOOK : INLINE_LOOK);
	dom.states = {
		hover: block ? { color: 'var(--muted-text)' } : { backgroundColor: 'color-mix(in srgb, var(--color-primary-500) 12%, transparent)' }
	};
	dom.hint = source.trim();
	return {
		dom,
		selectNode() {
			setLook(dom, block ? SELECTED_LOOK : INLINE_SELECTED_LOOK);
		},
		deselectNode() {
			for (const name of ['outline', 'outline-offset']) dom.style.removeProperty(name);
		},
		stopEvent(event) {
			const pos = getPos();
			if (pos === undefined || !pressed(event)) return false;
			openDrawnChip(view, pos);
			return true;
		}
	};
}
