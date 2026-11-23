// a reference drawn as RefDisplay drew it: the number it prints in the reference color, red when the compiler says it
// points at nothing; a click goes to its label
import type { Node as PMNode } from 'prosemirror-model';
import type { Decoration } from 'prosemirror-view';
import type { CanvasNodeViewConstructor, StyleLook } from '$lib/editor/canvas';
import { setLook } from '$lib/editor/canvas';
import { countedLabelsOf, jumpToLabel, projectIntelStore, undefinedRefs } from '$lib/languages/latex/visual/core';
import { refState } from './refState';

// tinted text at the surrounding size: inline, so the padding cannot grow the line box
const FOUND: StyleLook = {
	borderRadius: 'var(--radius-base)',
	cursor: 'pointer',
	paddingTop: '0.125rem',
	paddingBottom: '0.125rem',
	color: 'var(--color-ref-fg)'
};
const BROKEN: StyleLook = { ...FOUND, color: 'var(--color-ref-broken-fg)' };

function stateOf(node: PMNode, decorations: readonly Decoration[]) {
	const label = node.textContent;
	const counted = countedLabelsOf(decorations);
	return refState(
		String(node.attrs.command ?? 'ref'),
		label,
		counted?.get(label.trim())?.number,
		projectIntelStore.current.auxNumbers,
		undefinedRefs.current
	);
}

export function refCanvasView(onJumpToLabel?: (name: string) => boolean): CanvasNodeViewConstructor {
	return (node, view, _getPos, decorations) => {
		const { el, read } = view.canvas.build;
		const dom = el('span', 'ref-node');
		let current = node;
		function draw(next: PMNode, at: readonly Decoration[]): void {
			const label = next.textContent;
			const state = read({ kind: 'store', name: 'drawnInputs' }, () => stateOf(next, at));
			dom.textContent = state.text;
			setLook(dom, state.broken ? BROKEN : FOUND);
			dom.states = { hover: { backgroundColor: state.broken ? 'var(--color-ref-broken-bg)' : 'var(--color-ref-bg)' } };
			dom.hint = state.broken ? `Label "${label}" not found` : state.text === label ? `Reference: ${label}` : `Reference to ${label}`;
		}
		draw(node, decorations);
		dom.on.click = () => {
			jumpToLabel(view, current.textContent, onJumpToLabel);
			return true;
		};
		return {
			dom,
			update(next, nextDecorations) {
				if (next.type !== current.type) return false;
				current = next;
				draw(next, nextDecorations);
				return true;
			}
		};
	};
}
