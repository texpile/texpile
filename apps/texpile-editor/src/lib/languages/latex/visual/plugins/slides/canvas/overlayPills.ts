// the pill naming a mark's or an item's overlay (`<2->`, `uncover <3->`), beside the text it governs
import type { Node as PMNode } from 'prosemirror-model';
import { Decoration } from 'prosemirror-view';
import { setLook, type CanvasWidget, type StyleLook } from '$lib/editor/canvas';

const PILL_LOOK: StyleLook = {
	display: 'inline-block',
	padding: '0 0.4em',
	borderRadius: '999px',
	fontFamily: 'var(--font-mono, monospace)',
	fontSize: '0.65rem',
	lineHeight: '1.5',
	color: 'var(--faint-text)',
	backgroundColor: 'color-mix(in srgb, var(--color-surface-500) 14%, transparent)',
	verticalAlign: '0.1em'
};
const MARK_PILL_LOOK: StyleLook = { ...PILL_LOOK, marginLeft: '0.15em', marginRight: '0.3em' };
const ITEM_PILL_LOOK: StyleLook = { ...PILL_LOOK, marginLeft: '0.5em', marginRight: '0' };

function pill(text: string, look: StyleLook): CanvasWidget {
	return {
		kind: 'inline',
		build(ctx) {
			const el = ctx.el('span', 'beamer-overlay-pill', text);
			setLook(el, look);
			return el;
		}
	};
}

function pillWidget(pos: number, text: string, look: StyleLook, key: string): Decoration {
	// side 1: the caret at the place stays before the pill, as it did before the DOM's ::before
	return Decoration.widget(pos, () => document.createElement('span'), { side: 1, ignoreSelection: true, canvas: pill(text, look), key });
}

/** a pill where each overlay mark opens in the textblock at `pos` */
export function markPills(textblock: PMNode, pos: number): Decoration[] {
	const pills: Decoration[] = [];
	let open: unknown = null;
	textblock.forEach((child, offset) => {
		const mark = child.marks.find((m) => m.type.name === 'overlay') ?? null;
		if (mark && !(open && mark.eq(open as typeof mark))) {
			const { command, spec } = mark.attrs;
			const text = command && command !== 'only' ? `${String(command)} ${String(spec ?? '')}` : String(spec ?? '');
			pills.push(pillWidget(pos + 1 + offset, text, MARK_PILL_LOOK, `overlay-${text}`));
		}
		open = mark;
	});
	return pills;
}

/** the pill after an overlay item's first paragraph */
export function itemPill(paragraph: PMNode, pos: number, overlay: string): Decoration {
	return pillWidget(pos + paragraph.nodeSize - 1, overlay, ITEM_PILL_LOOK, `item-overlay-${overlay}`);
}
