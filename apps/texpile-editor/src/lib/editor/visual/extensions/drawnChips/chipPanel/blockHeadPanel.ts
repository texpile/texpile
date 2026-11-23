// the chip panel a canvas block opens on its head (an environment's first line, a Typst layout call), under where the gear
// or the head stood; it reads the head again after each edit and goes with the block
import type { Node as PMNode } from 'prosemirror-model';
import type { Transaction } from 'prosemirror-state';
import type { VisualView } from '$lib/editor/canvas';
import type { GearPlace } from '$lib/editor/visual/extensions/blockHandle/blockSettings';
import { nodeStillAt } from '$lib/editor/visual/extensions/blockHandle/nodePosition';
import { placedHost } from '$lib/editor/visual/extensions/blockHandle/placedHost';
import { redoVisual, undoVisual } from '$lib/editor/visual/visualUndo';
import { dismissChipPanel, openChipPanel, syncChipPanel, type ChipSettings } from './chipPanel.svelte';

export type BlockHead = {
	language: 'latex' | 'typst';
	/** the block it is open for is still this node at its place */
	holds(node: PMNode): boolean;
	source(node: PMNode): string;
	settingsFor(source: string): ChipSettings | null;
	/** the head as typed or chosen: the block's attrs it makes, or null to write nothing */
	attrsFor(node: PMNode, next: string): PMNode['attrs'] | null;
	/** what else the same edit changes, such as the references of a renamed label */
	alsoChange?(tr: Transaction, node: PMNode, attrs: PMNode['attrs']): void;
};

export function openBlockHeadPanel(view: VisualView, pos: number, place: GearPlace, head: BlockHead): void {
	function now(): PMNode | null {
		const node = nodeStillAt(view.state.doc, pos);
		return node && head.holds(node) ? node : null;
	}
	const node = now();
	if (!node) return;
	const placed = placedHost(view, place);
	// the attrs the field stands for: it keeps what is typed in it, and follows only a change made elsewhere
	let shown = JSON.stringify(node.attrs);
	const stop = view.canvas.onLayout(() => {
		const current = now();
		if (current) {
			if (JSON.stringify(current.attrs) === shown) return;
			shown = JSON.stringify(current.attrs);
			return syncChipPanel(placed.host, head.source(current));
		}
		dismissChipPanel(placed.host);
		close();
	});
	function close(): void {
		stop();
		placed.remove();
	}
	function write(next: string): void {
		const current = now();
		const attrs = current && head.attrsFor(current, next);
		if (!current || !attrs || JSON.stringify(attrs) === JSON.stringify(current.attrs)) return;
		const tr = view.state.tr.setNodeMarkup(pos, undefined, attrs);
		head.alsoChange?.(tr, current, attrs);
		view.dispatch(tr);
		shown = JSON.stringify(view.state.doc.nodeAt(pos)?.attrs ?? null);
	}
	openChipPanel({
		anchor: placed.host,
		source: head.source(node),
		language: head.language,
		inline: false,
		settingsFor: head.settingsFor,
		write,
		writeSetting: write,
		jump: () => {},
		jumpToDefinition: () => {},
		view,
		undo: () => undoVisual(),
		redo: () => redoVisual(),
		onClose(how) {
			close();
			if (how !== 'away') view.focus();
		}
	});
}
