// laid-out top-level blocks by node, reused under an equal layout key (5.6); heights outlive the layouts
import type { Node as PMNode } from 'prosemirror-model';
import type { BlockLayout } from '../contracts/layoutTypes';

/** what a cached layout was made under: the column width, the style and layout epochs, the decoration signature (9.5) */
export type LayoutKey = { readonly width: number; readonly epoch: string; readonly signature: string };

/** a block's last measured box and the width it was measured at */
export type MeasuredHeight = { readonly width: number; readonly height: number; readonly marginTop: number; readonly marginBottom: number };

/** key null: stale, kept until swept so its children are released with it */
type CachedLayout = { readonly layout: BlockLayout; key: LayoutKey | null; used: number };

const KEPT_LAYOUTS = 400;
/** the spike's rule: past KEPT_LAYOUTS, a layout no frame drew for this many frames goes */
const IDLE_FRAMES = 2;

function sameKey(a: LayoutKey, b: LayoutKey): boolean {
	return a.width === b.width && a.epoch === b.epoch && a.signature === b.signature;
}

export class LayoutCache {
	private readonly layouts = new Map<PMNode, CachedLayout>();
	private readonly heights = new WeakMap<PMNode, MeasuredHeight>();
	private frame = 0;

	/** release: an evicted layout's block lets its children go */
	constructor(private readonly release: (layout: BlockLayout) => void) {}

	get size(): number {
		return this.layouts.size;
	}

	get(node: PMNode, key: LayoutKey): BlockLayout | null {
		const cached = this.layouts.get(node);
		if (!cached?.key || !sameKey(cached.key, key)) return null;
		cached.used = this.frame;
		return cached.layout;
	}

	/** the layout the node has, whatever key it was made under */
	peek(node: PMNode): BlockLayout | null {
		return this.layouts.get(node)?.layout ?? null;
	}

	set(node: PMNode, key: LayoutKey, layout: BlockLayout, width: number): void {
		this.layouts.set(node, { layout, key, used: this.frame });
		const { height, outerMargin } = layout;
		this.heights.set(node, { width, height, marginTop: outerMargin.top, marginBottom: outerMargin.bottom });
	}

	/** the height a node had when last laid out, at any width */
	measured(node: PMNode): MeasuredHeight | null {
		return this.heights.get(node) ?? null;
	}

	/** a stale layout: an input it read changed; its elements stay until it is relaid or swept */
	drop(node: PMNode): void {
		const cached = this.layouts.get(node);
		if (cached) cached.key = null;
	}

	/** a node a transaction replaced: its elements may live on in the node that took its place, so nothing is released */
	forget(node: PMNode): void {
		this.layouts.delete(node);
	}

	/** keeps the measured height and lets the children go (idle heights) */
	evict(node: PMNode): void {
		const cached = this.layouts.get(node);
		if (!cached) return;
		this.layouts.delete(node);
		this.release(cached.layout);
	}

	/** every layout stale (a new width, new faces) */
	clear(): void {
		for (const cached of this.layouts.values()) cached.key = null;
	}

	/** the view at rest: every layout but these goes */
	keepOnly(kept: ReadonlySet<PMNode>): void {
		for (const node of [...this.layouts.keys()]) if (!kept.has(node)) this.evict(node);
	}

	/** once per frame: past KEPT_LAYOUTS, layouts no frame used lately are evicted */
	sweep(): void {
		this.frame++;
		if (this.layouts.size <= KEPT_LAYOUTS) return;
		for (const [node, cached] of this.layouts) if (this.frame - cached.used > IDLE_FRAMES) this.evict(node);
	}
}
