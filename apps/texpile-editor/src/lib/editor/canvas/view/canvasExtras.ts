// view.canvas: what app code asks the canvas in place of the DOM tree it used to read (2.1)
import type { Selection } from 'prosemirror-state';
import type { CaretPlace, CanvasGeometry } from '../contracts/geometryTypes';
import type { HoverState } from '../contracts/inputTypes';
import type { DocRect, LayoutBox } from '../contracts/layoutTypes';
import type { OverlayAnchors } from '../contracts/overlayTypes';
import type { ProbeView } from '../contracts/probeTypes';
import type { CanvasExtras } from '../contracts/viewTypes';
import type { FocusPlace } from '../interaction/focus/focusModel.svelte';
import type { NestedEditor } from '../contracts/nodeViewTypes';
import { currentBuild } from '../views/buildScope';
import { tableColumnWidths } from '../layout/table/tableLayout';
import type { CanvasSurface } from '../frame/surface';
import type { ReadyGate } from '../frame/readyGate';
import { descAt } from '../tree/nodeViewDesc';
import type { RevealPolicy } from './reveal';
import { blockActionsAt, nodeText, type ViewQueryHost } from './viewQueries';

export type CanvasExtrasParts = {
	readonly queries: ViewQueryHost;
	readonly surface: CanvasSurface;
	readonly reveal: RevealPolicy;
	readonly hover: HoverState;
	nested(): NestedEditor | null;
	geometry(): CanvasGeometry;
	anchors(): OverlayAnchors;
	/** set in dev and test builds and when the probe is asked for (probe/canvasProbe.ts) */
	probe(): ProbeView | null;
	focusPlace(): FocusPlace;
	head(): CaretPlace;
	scroller(): HTMLElement;
	onSelection(listener: (selection: Selection) => void): () => void;
	/** fired after a frame that replaced estimates with measurements */
	readonly layoutListeners: Set<() => void>;
	readonly frameListeners: Set<() => void>;
	holdPosition<T>(change: () => T, anchor: 'caret' | 'viewport'): T;
	holdWidth(): void;
	releaseWidth(): void;
	setZoom(zoom: number): void;
	relayout(): void;
	ready(): Pick<ReadyGate, 'rearm' | 'holdWhilePlacing'>;
};

/** the root event the image face listens for to mount the paper cropper (15.2) */
export const START_CROP_EVENT = 'canvasstartcrop';

function listen(set: Set<() => void>, listener: () => void): () => void {
	set.add(listener);
	return () => set.delete(listener);
}

function firstTableIn(box: LayoutBox): LayoutBox | null {
	if (box.kind === 'table') return box;
	for (const child of box.children) {
		const found = firstTableIn(child);
		if (found) return found;
	}
	return null;
}

/** the table box in its block's cached layout: the node's root box, or the table its face wraps */
function tableBox(box: LayoutBox, offset: number): LayoutBox | null {
	if (box.node?.offset === offset) return firstTableIn(box);
	for (const child of box.children) {
		const found = tableBox(child, offset);
		if (found) return found;
	}
	return null;
}

export function createCanvasExtras(parts: CanvasExtrasParts): CanvasExtras {
	const { queries, surface } = parts;
	function clientRect(rect: DocRect): DOMRect {
		return surface.clientRect(rect);
	}
	return {
		get geometry() {
			return parts.geometry();
		},
		get anchors() {
			return parts.anchors();
		},
		get scroller() {
			return parts.scroller();
		},
		get probe() {
			return parts.probe();
		},
		hover: parts.hover,
		get build() {
			return currentBuild();
		},
		focusState: () => parts.focusPlace(),
		nested: () => parts.nested(),
		head: () => parts.head(),
		docPoint: (client) => surface.docPoint(client),
		clientRect,
		sheetClientRect: () => surface.sheetClientRect(),
		nodeClientRect(pos) {
			const found = parts.geometry().nodeRect(pos);
			return found ? { rect: clientRect(found.rect), estimated: found.estimated } : null;
		},
		nodeText: (pos) => nodeText(queries, pos),
		rangeClientRects: (from, to, reach = 'text') => parts.geometry().rangeRects(from, to, reach).map(clientRect),
		rangeTop(pos) {
			const { y, estimated } = parts.geometry().rangeTop(pos);
			return { top: clientRect({ x: 0, y, width: 0, height: 0 }).top, estimated };
		},
		columnWidths(tablePos) {
			const { index, model } = queries;
			const block = index.indexAt(tablePos);
			const layout = model.cached(block);
			const box = layout && tableBox(layout.box, tablePos - index.blocks[block].pos);
			return box ? tableColumnWidths(box) : null;
		},
		blockActions: (pos) => blockActionsAt(queries, pos),
		decorationsFor(pos) {
			const entry = queries.index.blocks[queries.index.indexAt(pos)];
			if (!entry) return [];
			return descAt(queries.elements.sync(entry, queries.selectedPos()), pos - entry.pos)?.outerDeco ?? [];
		},
		revealPos: (pos, mode, behavior) => parts.reveal.revealPos(pos, mode, behavior),
		holdPosition: (change, anchor = 'viewport') => parts.holdPosition(change, anchor),
		holdWidth: () => parts.holdWidth(),
		releaseWidth: () => parts.releaseWidth(),
		setZoom: (zoom) => parts.setZoom(zoom),
		relayout: () => parts.relayout(),
		holdUntilReady: () => parts.ready().rearm(),
		holdWhilePlacing: (placed) => parts.ready().holdWhilePlacing(placed),
		startCrop(pos) {
			surface.dom.dispatchEvent(new CustomEvent(START_CROP_EVENT, { detail: { pos } }));
		},
		onLayout: (listener) => listen(parts.layoutListeners, listener),
		onSelection: (listener) => parts.onSelection(listener),
		onFrame: (listener) => listen(parts.frameListeners, listener)
	};
}
