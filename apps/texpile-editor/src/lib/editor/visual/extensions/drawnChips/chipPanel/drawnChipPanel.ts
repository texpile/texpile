// a drawn chip's panel on the canvas, under the chip: its settings, or its LaTeX when it has none. The node keeps its
// source, so an unedited chip saves byte for byte; an edit that reads as text comes out as text when the panel closes
import type { Node as PMNode } from 'prosemirror-model';
import { NodeSelection, type Selection } from 'prosemirror-state';
import type { ViewElementRef, VisualView } from '$lib/editor/canvas';
import type { GearPlace } from '$lib/editor/visual/extensions/blockHandle/blockSettings';
import { nodeStillAt } from '$lib/editor/visual/extensions/blockHandle/nodePosition';
import { placedHost } from '$lib/editor/visual/extensions/blockHandle/placedHost';
import { gapAwareSelectionNear } from '$lib/editor/visual/gapSelection';
import { redoVisual, undoVisual } from '$lib/editor/visual/visualUndo';
import type { DrawnChipKind } from '../chipKind';
import { chipDrawingOf, drawnChipOf } from '../chipShows';
import { dismissChipPanel, openChipPanel, type ChipPanelClose } from './chipPanel.svelte';

export type ChipKindOf = (view: VisualView, block: boolean) => DrawnChipKind;

const kinds = new WeakMap<VisualView, ChipKindOf>();
let openFor: { view: VisualView; pos: number } | null = null;

/** the view's chips open their panel with what this language gives them */
export function offerChipPanels(view: VisualView, kindOf: ChipKindOf): void {
	kinds.set(view, kindOf);
}

// the chip's drawn element, which a new face for an edited source replaces
function chipPlace(view: VisualView, pos: number): GearPlace | null {
	function boxOf(): DOMRect | null {
		return (view.nodeDOM(pos) as ViewElementRef | null)?.getBoundingClientRect() ?? null;
	}
	const first = boxOf();
	if (!first) return null;
	return () => {
		const now = boxOf() ?? first;
		return { x: now.left, y: now.top, width: now.width, height: now.height };
	};
}

export function openDrawnChipPanel(view: VisualView, pos: number): void {
	const node = view.state.doc.nodeAt(pos);
	const kind = node && drawnChipOf(node) ? kinds.get(view)?.(view, node.isBlock) : null;
	if (!node || !kind || (openFor?.view === view && openFor.pos === pos)) return;
	const place = chipPlace(view, pos);
	if (!place) return;
	const opened = node.textContent;
	const placed = placedHost(view, place);
	openFor = { view, pos };
	function chip(): PMNode | null {
		const now = nodeStillAt(view.state.doc, pos);
		return now && chipDrawingOf(now) ? now : null;
	}
	const stop = view.canvas.onLayout(() => {
		if (chip()) return;
		dismissChipPanel(placed.host);
		release();
	});
	function release(): void {
		stop();
		placed.remove();
		if (openFor?.view === view && openFor.pos === pos) openFor = null;
	}
	function write(next: string): void {
		const now = chip();
		if (!now) return;
		const tr = view.state.tr;
		if (next) tr.replaceWith(pos + 1, pos + now.nodeSize - 1, view.state.schema.text(next));
		else tr.delete(pos + 1, pos + now.nodeSize - 1);
		view.dispatch(tr.setSelection(NodeSelection.create(tr.doc, pos)));
	}
	// a source ending in a command name gets {}, so the letter after an inline chip cannot join the name
	function separated(text: string): string {
		const now = chip();
		if (!now || kind!.block || kind!.language !== 'latex' || !/\\[a-zA-Z@]+$/.test(text)) return text;
		const after = view.state.doc.resolve(pos + now.nodeSize).nodeAfter;
		return after?.isText && /^[a-zA-Z@]/.test(after.text ?? '') ? text + '{}' : text;
	}
	// after the chip; on the next line when the chip is the end of its paragraph's last line
	function caretAfter(now: PMNode): Selection {
		const { doc } = view.state;
		const $end = doc.resolve(pos + now.nodeSize);
		const ownLine = kind!.block || drawnChipOf(now)?.ownLine === true;
		const endsLine = ownLine && $end.depth > 0 && $end.parentOffset === $end.parent.content.size;
		return gapAwareSelectionNear(doc.resolve(endsLine ? $end.after() : $end.pos), 1);
	}
	// words typed into the chip come out as text
	function readAgain(now: PMNode, caretAfterIt: boolean): boolean {
		const nodes = kind!.reparse(now.textContent, now);
		if (!nodes) return false;
		const end = pos + now.nodeSize;
		let tr;
		try {
			tr = view.state.tr.replaceWith(pos, end, nodes);
		} catch {
			return false;
		}
		if (caretAfterIt) tr.setSelection(gapAwareSelectionNear(tr.doc.resolve(tr.mapping.map(end)), 1));
		view.dispatch(tr.scrollIntoView());
		if (caretAfterIt) view.focus();
		return true;
	}
	// `away` is a click elsewhere, which places the caret itself; the keys that close the panel leave it after the chip
	function closed(how: ChipPanelClose): void {
		release();
		const typed = chip()?.textContent;
		if (typed !== undefined && separated(typed) !== typed) write(separated(typed));
		const now = chip();
		if (!now || (now.textContent !== opened && readAgain(now, how !== 'away')) || how === 'away') return;
		view.dispatch(view.state.tr.setSelection(caretAfter(now)).scrollIntoView());
		view.focus();
	}
	openChipPanel({
		anchor: placed.host,
		source: opened,
		language: kind.language,
		inline: !kind.block,
		settingsFor: kind.settingsFor,
		write,
		writeSetting: (next) => write(separated(next)),
		jump: kind.jump,
		jumpToDefinition: kind.jumpToDefinition,
		view,
		undo: () => undoVisual(),
		redo: () => redoVisual(),
		onClose: closed,
		footer: kind.footerFor?.(opened) ?? null,
		caret: kind.caretFor?.(opened),
		action: kind.actionFor?.(opened, pos) ?? null
	});
}
