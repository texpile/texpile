// the in-flow overlays node views offer (12.1): mounted in a layer that stands before view.dom in the scroller's content, so
// native scrolling moves them with the text, and placed where their node lays out after each frame
import { mount, unmount } from 'svelte';
import { NodeSelection } from 'prosemirror-state';
import type { FaceUiState, OverlaySpec } from '../contracts/faceTypes';
import type { HoverState } from '../contracts/inputTypes';
import type { VisualView } from '../contracts/viewTypes';
import type { NodeViewDesc } from '../tree/nodeViewDesc';
import OverlayLayer from './OverlayLayer.svelte';

export type PlacedOverlay = {
	readonly key: string;
	readonly spec: OverlaySpec;
	readonly left: number;
	readonly top: number;
	readonly width: number;
	readonly height: number;
	readonly owner: NodeViewDesc;
};

function shown(spec: OverlaySpec, ui: FaceUiState, held: boolean): boolean {
	switch (spec.when) {
		case 'always':
			return true;
		case 'hovered':
			return ui.hovered;
		case 'anchorHovered':
			return held || (ui.hovered && ui.hoveredPart === (spec.anchor.part ?? null));
		case 'selected':
			return ui.selected;
		case 'caretInside':
			return ui.caretInside;
		case 'hoveredOrCaretInside':
			return ui.hovered || ui.caretInside;
	}
}

function samePlaced(a: readonly PlacedOverlay[], b: readonly PlacedOverlay[]): boolean {
	if (a.length !== b.length) return false;
	return a.every((one, i) => {
		const other = b[i];
		if (one.key !== other.key || one.left !== other.left || one.top !== other.top) return false;
		if (one.width !== other.width || one.height !== other.height || one.spec.component !== other.spec.component) return false;
		const keys = Object.keys(one.spec.props);
		return keys.length === Object.keys(other.spec.props).length && keys.every((k) => one.spec.props[k] === other.spec.props[k]);
	});
}

export class OverlayHost {
	placed = $state.raw<readonly PlacedOverlay[]>([]);
	/** the node whose overlay the pointer is on: it stays hovered though the canvas no longer is */
	private held: NodeViewDesc | null = null;
	private readonly layer: HTMLElement;
	private readonly app: ReturnType<typeof mount>;
	private readonly stops: (() => void)[] = [];

	constructor(
		private readonly view: VisualView,
		private readonly nodes: ReadonlySet<NodeViewDesc>,
		private readonly hover: HoverState
	) {
		const doc = view.dom.ownerDocument;
		this.layer = doc.createElement('div');
		this.layer.className = 'canvas-overlay-layer';
		Object.assign(this.layer.style, { position: 'relative', height: '0', zIndex: '1' });
		view.dom.before(this.layer);
		this.app = mount(OverlayLayer, { target: this.layer, props: { host: this } });
		this.stops.push(view.canvas.onFrame(() => this.refresh()));
		this.stops.push(
			$effect.root(() => {
				$effect(() => {
					void this.hover.chain;
					void this.hover.blockFor;
					this.refresh();
				});
			})
		);
	}

	/** returns the way to take the layer down */
	static mount(view: VisualView, nodes: ReadonlySet<NodeViewDesc>, hover: HoverState): () => void {
		const host = new OverlayHost(view, nodes, hover);
		return () => host.destroy();
	}

	hold(owner: NodeViewDesc, on: boolean): void {
		if (on) this.held = owner;
		else if (this.held === owner) this.held = null;
		this.refresh();
	}

	private uiOf(desc: NodeViewDesc): FaceUiState {
		const { view, hover } = this;
		const { selection } = view.state;
		const pos = desc.pos();
		const end = pos + desc.node.nodeSize;
		const hovered = this.held === desc || hover.blockFor === pos || hover.chain.includes(desc.nodeDOM);
		return {
			selected: selection instanceof NodeSelection && selection.from === pos,
			hovered,
			hoveredPart: hovered && hover.pos === pos ? hover.part : null,
			caretInside: selection.from > pos && selection.to < end,
			focused: view.hasFocus(),
			readOnly: !view.editable,
			visible: true
		};
	}

	refresh(): void {
		if (!this.nodes.size && !this.placed.length) return;
		const { geometry } = this.view.canvas;
		const origin = this.layer.getBoundingClientRect();
		// a view built again stands beside the one it replaces until that one is destroyed: the newer one's overlay is kept
		const next = new Map<string, PlacedOverlay>();
		for (const desc of this.nodes) {
			const ui = this.uiOf(desc);
			const pos = desc.pos();
			for (const spec of desc.spec?.overlays?.(ui) ?? []) {
				if (!shown(spec, ui, this.held === desc)) continue;
				const rect = spec.anchor.part ? geometry.partRect(pos, spec.anchor.part) : (geometry.nodeRect(pos)?.rect ?? null);
				if (!rect) continue;
				const box = this.view.canvas.clientRect(rect);
				// by place, so a view built again keeps its overlays mounted with their state (a crop being dragged)
				const key = `${pos}:${desc.node.type.name}:${spec.key}`;
				next.set(key, {
					key,
					spec,
					left: box.left - origin.left,
					top: box.top - origin.top,
					width: box.width,
					height: box.height,
					owner: desc
				});
			}
		}
		const placed = [...next.values()];
		if (!samePlaced(placed, this.placed)) this.placed = placed;
	}

	destroy(): void {
		for (const stop of this.stops) stop();
		void unmount(this.app);
		this.layer.remove();
	}
}
