import { describe, expect, it } from 'vitest';
import type { BlockLayout } from '$lib/editor/canvas';
import { LayoutCache, type LayoutKey } from '$lib/editor/canvas/document/layoutCache';
import { testSchema } from '../testing/testCanvasView';

const KEY: LayoutKey = { width: 600, epoch: '0.0', signature: '' };

function layoutOf(height: number): BlockLayout {
	return { box: { element: null } as never, height, outerMargin: { top: 4, bottom: 8 }, positions: null as never, keys: [], error: null };
}

function paragraphs(count: number) {
	return Array.from({ length: count }, (_, i) => testSchema.node('paragraph', null, [testSchema.text(`p${i}`)]));
}

describe('the layout cache', () => {
	it('reuses a layout only under an equal key, and keeps the height past eviction', () => {
		const released: BlockLayout[] = [];
		const cache = new LayoutCache((layout) => released.push(layout));
		const [node] = paragraphs(1);
		const layout = layoutOf(30);
		cache.set(node, KEY, layout, 600);
		expect(cache.get(node, KEY)).toBe(layout);
		expect(cache.get(node, { ...KEY, width: 500 })).toBeNull();
		expect(cache.get(node, { ...KEY, signature: '3:1:footnote;' })).toBeNull();
		cache.evict(node);
		expect(released).toEqual([layout]);
		expect(cache.get(node, KEY)).toBeNull();
		expect(cache.measured(node)).toEqual({ width: 600, height: 30, marginTop: 4, marginBottom: 8 });
	});

	// settled memory: a view left alone holds the screen and what a scroll reaches next, whatever was scrolled through
	it('at rest, releases every layout but those it is told to keep, and keeps their heights', () => {
		const released: BlockLayout[] = [];
		const cache = new LayoutCache((layout) => released.push(layout));
		const nodes = paragraphs(5);
		const layouts = nodes.map((node) => {
			const layout = layoutOf(20);
			cache.set(node, KEY, layout, 600);
			return layout;
		});
		cache.keepOnly(new Set(nodes.slice(1, 3)));
		expect(released).toEqual([layouts[0], layouts[3], layouts[4]]);
		expect(cache.size).toBe(2);
		expect(cache.measured(nodes[4])?.height).toBe(20);
	});

	it('past 400 layouts, releases those no frame used for two frames, stale ones included, and never a replaced node', () => {
		const released = new Set<BlockLayout>();
		const cache = new LayoutCache((layout) => released.add(layout));
		const nodes = paragraphs(410);
		const layouts = nodes.map((node) => {
			const layout = layoutOf(20);
			cache.set(node, KEY, layout, 600);
			return layout;
		});
		cache.drop(nodes[1]);
		cache.forget(nodes[2]);
		cache.sweep();
		cache.sweep();
		expect(released.size).toBe(0);
		cache.get(nodes[0], KEY);
		cache.sweep();
		expect(cache.get(nodes[0], KEY)).toBe(layouts[0]);
		expect(released.has(layouts[0])).toBe(false);
		expect(released.has(layouts[1])).toBe(true);
		expect(released.has(layouts[2])).toBe(false);
		expect(released.size).toBe(408);
	});
});
