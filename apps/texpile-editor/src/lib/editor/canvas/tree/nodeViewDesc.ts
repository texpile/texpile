// prosemirror-view's NodeViewDesc on FaceElements: a node's view, built and reused by its rules (viewdesc.ts, 1.42.9)
import type { Node as PMNode } from 'prosemirror-model';
import type { Decoration, DecorationSource } from 'prosemirror-view';
import type { CanvasBuildHelpers, CanvasEvent, CanvasNodeView, CanvasNodeViewConstructor } from '../contracts/nodeViewTypes';
import type { VisualView } from '../contracts/viewTypes';
import { inBuild } from '../views/buildScope';
import type { FaceBuildScope } from '../views/faceContext';
import { renderToDom } from '../views/viewRegistry';
import { noteViewShape } from '../views/viewShapes';
import { nodeAfterPart } from '../decorations/nodeAfterPart';
import { sameDecorationSource } from '../decorations/decorationAttrs';
import { patchOuterDecorations, sameOuterDecorations, walkDecoratedChildren, type DecoratedChild } from './decorationElements';
import { FaceElement, type FaceChild } from './faceElement';
import type { MarkViewDescs } from './markViewDesc';
import { WidgetViewDesc } from './widgetViewDesc';

export type ViewDesc = NodeViewDesc | WidgetViewDesc;

/** the default selectNode: the selected-node look on nodeDOM (CanvasStyleResolver.markSelectedNode) */
export type SelectedNodeMarker = { markSelectedNode(el: FaceElement, on: boolean): void };

/** what one update of a top-level block's views reads */
export type ViewDescBuild = {
	readonly view: VisualView;
	nodeViewOf(node: PMNode): CanvasNodeViewConstructor | null;
	readonly scope: FaceBuildScope;
	/** view.canvas.build while a constructor or update runs */
	readonly tools: CanvasBuildHelpers;
	readonly marks: MarkViewDescs;
	readonly selectedNode: SelectedNodeMarker;
	/** the position of a NodeSelection's node, which is selected as it is built */
	readonly selectedPos: number | null;
	/** the top node's own view alone, its children left for later: a block never laid out styles its type's estimate */
	readonly shallow?: boolean;
	/** the views offering overlays, which the overlay layer asks after each frame */
	readonly overlaid?: Set<NodeViewDesc>;
};

const SELECTED_NODE_CLASS = 'ProseMirror-selectednode';

type Placement = { readonly parent: NodeViewDesc | null; readonly offset: number; readonly base: () => number };

export class NodeViewDesc {
	readonly kind = 'node';
	children: readonly ViewDesc[] = [];
	/** false while a shallow build or update left the children behind the node */
	filled = true;
	private selected = false;
	private destroyed = false;
	/** the after part belongs to a decoration, which it leaves with */
	private decoratedAfter = false;
	private overlaid: Set<NodeViewDesc> | null = null;

	private constructor(
		public node: PMNode,
		/** the node view; null: the node's toDOM */
		readonly spec: CanvasNodeView | null,
		public outerDeco: readonly Decoration[],
		public innerDeco: DecorationSource,
		/** the outermost decoration wrapper, or nodeDOM */
		public dom: FaceElement,
		readonly contentDOM: FaceElement | null,
		readonly nodeDOM: FaceElement,
		private placement: Placement
	) {}

	static create(
		node: PMNode,
		outerDeco: readonly Decoration[],
		innerDeco: DecorationSource,
		placement: Placement,
		build: ViewDescBuild
	): NodeViewDesc {
		const atBuild = (placement.parent ? placement.parent.pos() + 1 : placement.base()) + placement.offset;
		const custom = build.nodeViewOf(node);
		let desc: NodeViewDesc | null = null;
		function getPos(): number | undefined {
			return !desc ? atBuild : desc.destroyed ? undefined : desc.pos();
		}
		const spec = custom && inBuild(build.tools, () => custom(node, build.view, getPos, outerDeco, innerDeco));
		if (custom && spec) noteViewShape(node, custom, spec);
		const { dom, contentDOM } = spec ?? renderToDom(node, build.tools.checkbox);
		const content = node.isLeaf ? null : (contentDOM ?? null);
		if (content) content.hole = true;
		desc = new NodeViewDesc(node, spec, [], innerDeco, dom, content, dom, placement);
		if (spec?.overlays && build.overlaid) (desc.overlaid = build.overlaid).add(desc);
		desc.updateOuterDeco(outerDeco, build.marks);
		if (build.selectedPos === atBuild) desc.selectNode(build.selectedNode);
		if (content && build.shallow) desc.filled = false;
		else if (content) desc.updateChildren(build);
		return desc;
	}

	get parent(): NodeViewDesc | null {
		return this.placement.parent;
	}

	get isDestroyed(): boolean {
		return this.destroyed;
	}

	get isSelected(): boolean {
		return this.selected;
	}

	/** from the parent's content start; 0 for a top-level block */
	get offset(): number {
		return this.placement.offset;
	}

	/** the position before the node, now */
	pos(): number {
		const { parent, offset, base } = this.placement;
		return parent ? parent.pos() + 1 + offset : base() + offset;
	}

	place(placement: Placement): void {
		this.placement = placement;
	}

	matchesNode(node: PMNode, outerDeco: readonly Decoration[], innerDeco: DecorationSource): boolean {
		return node.eq(this.node) && sameOuterDecorations(outerDeco, this.outerDeco) && sameDecorationSource(innerDeco, this.innerDeco);
	}

	/** CustomNodeViewDesc.update and NodeViewDesc.update: false means the node is built again */
	update(node: PMNode, outerDeco: readonly Decoration[], innerDeco: DecorationSource, placement: Placement, build: ViewDescBuild): boolean {
		const { spec } = this;
		if (spec?.update && (this.node.type === node.type || spec.multiType)) {
			if (!inBuild(build.tools, () => spec.update!(node, outerDeco, innerDeco))) return false;
		} else if (spec && !this.contentDOM && !node.isLeaf) return false;
		else if (!node.sameMarkup(this.node)) return false;
		this.updateInner(node, outerDeco, innerDeco, placement, build);
		return true;
	}

	/** the node and decorations it now stands for, its children matched again where they changed */
	updateInner(
		node: PMNode,
		outerDeco: readonly Decoration[],
		innerDeco: DecorationSource,
		placement: Placement,
		build: ViewDescBuild
	): void {
		this.place(placement);
		const changed = this.node !== node || !sameDecorationSource(innerDeco, this.innerDeco);
		this.node = node;
		this.innerDeco = innerDeco;
		this.updateOuterDeco(outerDeco, build.marks);
		if (!this.contentDOM || (!changed && this.filled)) return;
		if (build.shallow) this.filled = false;
		else this.updateChildren(build);
	}

	/** patches dom and its wrappers from the outer decorations it has to these; marks stay outermost */
	updateOuterDeco(outerDeco: readonly Decoration[], marks: MarkViewDescs): void {
		const chain = this.node.isInline ? marks.chainOf(this.node.marks) : null;
		if (!sameOuterDecorations(outerDeco, this.outerDeco)) {
			this.dom.marks = null;
			if (this.dom.viewDesc === this) this.dom.viewDesc = null;
			this.dom = patchOuterDecorations(this.dom, this.nodeDOM, this.outerDeco, outerDeco);
			this.outerDeco = outerDeco;
			const after = nodeAfterPart(outerDeco);
			if (after || this.decoratedAfter) this.nodeDOM.generatedAfter = after;
			this.decoratedAfter = !!after;
		}
		this.dom.viewDesc = this;
		this.dom.marks = chain;
	}

	selectNode(marker: SelectedNodeMarker): void {
		if (this.selected) return;
		this.selected = true;
		if (this.spec?.selectNode) this.spec.selectNode();
		else {
			// prosemirror-view's class, kept for queries; the look is the marker's
			this.nodeDOM.classList.add(SELECTED_NODE_CLASS);
			marker.markSelectedNode(this.nodeDOM, true);
		}
	}

	deselectNode(marker: SelectedNodeMarker): void {
		if (!this.selected) return;
		this.selected = false;
		// prosemirror-view's clearNodeSelection skips a desc already destroyed
		if (this.destroyed) return;
		if (this.spec?.deselectNode) this.spec.deselectNode();
		else {
			this.nodeDOM.classList.remove(SELECTED_NODE_CLASS);
			marker.markSelectedNode(this.nodeDOM, false);
		}
	}

	setSelection(anchor: number, head: number, root: VisualView): void {
		this.spec?.setSelection?.(anchor, head, root);
	}

	stopEvent(event: CanvasEvent): boolean {
		return this.spec?.stopEvent?.(event) ?? false;
	}

	/** the view's own destroy, then its children's */
	destroy(): void {
		if (this.destroyed) return;
		this.destroyed = true;
		this.overlaid?.delete(this);
		this.spec?.destroy?.();
		if (this.dom.viewDesc === this) this.dom.viewDesc = null;
		for (const child of this.children) child.destroy();
	}

	/** back to a shallow build: the next full sync builds the children again */
	releaseChildren(): void {
		for (const child of this.children) child.destroy();
		this.children = [];
		this.filled = false;
		this.contentDOM?.replaceChildren();
	}

	/** ViewTreeUpdater: unchanged node objects keep their views wherever they moved, then the next old view is updated */
	updateChildren(build: ViewDescBuild): void {
		const items = childItems(this);
		const oldNodes = this.children.filter(isNodeViewDesc);
		const oldWidgets = this.children.filter((child): child is WidgetViewDesc => !isNodeViewDesc(child));
		const matched = matchByIdentity(items, oldNodes);
		const claimed = new Set(matched.values());
		const top = topOf(this);
		function base(): number {
			return top.pos();
		}
		const ownOffset = this.pos() - top.pos();
		const next: ViewDesc[] = [];
		let oldIndex = -1;
		for (const item of items) {
			if (item.kind === 'widget') {
				const reused = oldWidgets.findIndex((old) => old.sameWidget(item.decoration));
				const offset = ownOffset + 1 + item.offset;
				next.push(
					reused >= 0
						? oldWidgets.splice(reused, 1)[0].moved(item.decoration, offset, base)
						: WidgetViewDesc.create(item.decoration, offset, base, build.scope)
				);
				continue;
			}
			const { node, outer, inner, offset } = item.child;
			const placement: Placement = { parent: this, offset, base };
			let found = matched.get(item) ?? null;
			if (found && !updateDesc(found, node, outer, inner, placement, build)) {
				found.destroy();
				found = null;
			} else if (found) oldIndex = oldNodes.indexOf(found);
			if (!found) {
				const candidate = oldNodes[oldIndex + 1];
				if (candidate && !claimed.has(candidate) && updateDesc(candidate, node, outer, inner, placement, build)) {
					found = candidate;
					claimed.add(candidate);
					oldIndex++;
				}
			}
			next.push(found ?? NodeViewDesc.create(node, outer, inner, placement, build));
		}
		const kept = new Set(next);
		for (const old of oldNodes) if (!kept.has(old)) old.destroy();
		for (const old of oldWidgets) old.destroy();
		this.children = next;
		this.filled = true;
		this.renderChildren();
	}

	/** renderDescs: syncs contentDOM's children to the views, so an unchanged contentDOM keeps its version */
	private renderChildren(): void {
		const { contentDOM } = this;
		if (!contentDOM) return;
		const wanted: FaceChild[] = [];
		for (const child of this.children) if (child.dom) wanted.push(child.dom);
		const current = contentDOM.childNodes;
		if (current.length === wanted.length && wanted.every((child, i) => current[i] === child)) return;
		contentDOM.replaceChildren(...wanted);
	}
}

function isNodeViewDesc(desc: ViewDesc): desc is NodeViewDesc {
	return desc instanceof NodeViewDesc;
}

/** findNodeMatch's matchesNode, then the view's update; false: build it again */
export function updateDesc(
	desc: NodeViewDesc,
	node: PMNode,
	outerDeco: readonly Decoration[],
	innerDeco: DecorationSource,
	placement: Placement,
	build: ViewDescBuild
): boolean {
	if (!desc.matchesNode(node, outerDeco, innerDeco)) return desc.update(node, outerDeco, innerDeco, placement, build);
	desc.updateInner(node, outerDeco, innerDeco, placement, build);
	return true;
}

type ChildItem = { kind: 'node'; child: DecoratedChild } | { kind: 'widget'; decoration: Decoration; offset: number };

function childItems(desc: NodeViewDesc): ChildItem[] {
	const items: ChildItem[] = [];
	walkDecoratedChildren(
		desc.node,
		desc.innerDeco,
		(decoration) => items.push({ kind: 'widget', decoration, offset: decoration.from }),
		(child) => items.push({ kind: 'node', child })
	);
	return items;
}

/** prosemirror-view's preMatch: unchanged node objects keep their views */
function matchByIdentity(items: readonly ChildItem[], old: readonly NodeViewDesc[]): Map<ChildItem, NodeViewDesc> {
	const byNode = new Map<PMNode, NodeViewDesc[]>();
	for (const desc of old) {
		const list = byNode.get(desc.node);
		if (list) list.push(desc);
		else byNode.set(desc.node, [desc]);
	}
	const matched = new Map<ChildItem, NodeViewDesc>();
	for (const item of items) {
		const desc = item.kind === 'node' ? byNode.get(item.child.node)?.shift() : undefined;
		if (desc) matched.set(item, desc);
	}
	return matched;
}

function topOf(desc: NodeViewDesc): NodeViewDesc {
	let top = desc;
	while (top.parent) top = top.parent;
	return top;
}

/** old nodes a widget shows (gone blocks): drawn with the view's own views, at no position of their own */
/** the view of the node that starts at offset (from the top-level block's start), descending through contentDOM */
export function descAt(top: NodeViewDesc, offset: number): NodeViewDesc | null {
	if (offset === 0) return top;
	let at: NodeViewDesc = top;
	let start = 0;
	for (;;) {
		const inside: NodeViewDesc | undefined = at.children.find(
			(child): child is NodeViewDesc =>
				isNodeViewDesc(child) && start + 1 + child.offset <= offset && offset < start + 1 + child.offset + child.node.nodeSize
		);
		if (!inside) return null;
		start += 1 + inside.offset;
		if (start === offset) return inside;
		at = inside;
	}
}

/** the innermost view whose content strictly holds from and to, as prosemirror-view's setSelection descends */
export function descHolding(top: NodeViewDesc, from: number, to: number): NodeViewDesc | null {
	if (from <= 0 || to >= top.node.nodeSize) return null;
	let at = top;
	let start = 0;
	for (;;) {
		const inside = at.children.find(
			(child): child is NodeViewDesc =>
				isNodeViewDesc(child) && from > start + 1 + child.offset && to < start + 1 + child.offset + child.node.nodeSize
		);
		if (!inside) return at;
		start += 1 + inside.offset;
		at = inside;
	}
}

/** the node an element draws as its nodeDOM, for the style base (StyleNodeSource of S1.4); null for an element inside a view */
export function nodeOfElement(el: FaceElement): { node: PMNode; getPos: () => number; parent: PMNode | null } | null {
	let owner = el.viewDesc;
	for (let at = el.parentNode; !owner && at instanceof FaceElement; at = at.parentNode) owner = at.viewDesc;
	const desc = owner;
	return desc && desc.nodeDOM === el ? { node: desc.node, getPos: () => desc.pos(), parent: desc.parent?.node ?? null } : null;
}
