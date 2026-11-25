// a citation drawn as the DOM editor's CitationDisplay: its text in the reference color, red when a key is not found
import type { Node as PMNode } from 'prosemirror-model';
import type { CanvasNodeViewConstructor, StyleLook } from '$lib/editor/canvas';
import { caretToChip, setLook } from '$lib/editor/canvas';
import { citationLookOf } from './node/citationLook';
import { openCitationForm } from './citationForm';

const FOUND: StyleLook = { borderRadius: 'var(--radius-base)', cursor: 'pointer', color: 'var(--color-ref-fg)' };
const BROKEN: StyleLook = { ...FOUND, color: 'var(--color-ref-broken-fg)' };

export function citationView(...[node, view, getPos]: Parameters<CanvasNodeViewConstructor>): ReturnType<CanvasNodeViewConstructor> {
	const { el, read } = view.canvas.build;
	const dom = el('span', 'citation');
	let current = node;
	function draw(next: PMNode): void {
		const look = read({ kind: 'store', name: 'drawnInputs' }, () => citationLookOf(next));
		dom.textContent = look.text;
		setLook(dom, look.found ? FOUND : BROKEN);
		dom.states = { hover: { backgroundColor: look.found ? 'var(--color-ref-bg)' : 'var(--color-ref-broken-bg)' } };
	}
	draw(node);
	dom.on.click = () => {
		const pos = getPos();
		if (pos === undefined) return true;
		caretToChip(view, pos);
		openCitationForm(view, pos);
		return true;
	};
	return {
		dom,
		update(next) {
			if (next.type !== current.type) return false;
			current = next;
			draw(next);
			return true;
		}
	};
}
