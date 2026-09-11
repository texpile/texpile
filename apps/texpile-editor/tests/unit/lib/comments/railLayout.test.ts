import { describe, it, expect } from 'vitest';
import { stackRailItems, type RailItem } from '$lib/comments/rail/railLayout';

const item = (id: string, anchor: number, height = 60): RailItem => ({ id, anchor, height });

function overlaps(items: RailItem[], pos: Map<string, number>, gap: number): boolean {
	const placed = items.map((i) => ({ top: pos.get(i.id)!, bottom: pos.get(i.id)! + i.height })).sort((a, b) => a.top - b.top);
	for (let i = 1; i < placed.length; i++) if (placed[i].top < placed[i - 1].bottom + gap) return true;
	return false;
}

describe('stackRailItems', () => {
	it('leaves cards on their anchors when they do not collide', () => {
		const items = [item('a', 0), item('b', 200), item('c', 400)];
		const pos = stackRailItems(items, null, 6);
		expect(pos.get('a')).toBe(0);
		expect(pos.get('b')).toBe(200);
		expect(pos.get('c')).toBe(400);
	});

	it('pushes colliding cards down, keeping the first on its anchor', () => {
		const items = [item('a', 100), item('b', 110), item('c', 120)];
		const pos = stackRailItems(items, null, 6);
		expect(pos.get('a')).toBe(100);
		expect(pos.get('b')).toBe(166);
		expect(pos.get('c')).toBe(232);
		expect(overlaps(items, pos, 6)).toBe(false);
	});

	it('pins the active card and moves the others out of its way in both directions', () => {
		const items = [item('a', 100), item('b', 130), item('c', 150), item('d', 600)];
		const pos = stackRailItems(items, 'b', 6);
		expect(pos.get('b')).toBe(130);
		expect(pos.get('a')).toBe(130 - 60 - 6);
		expect(pos.get('c')).toBe(130 + 60 + 6);
		expect(pos.get('d')).toBe(600);
		expect(overlaps(items, pos, 6)).toBe(false);
	});

	it('shifts the chain down, active card included, rather than pushing a card over the top', () => {
		const items = [item('a', 10), item('b', 20)];
		const pos = stackRailItems(items, 'b', 6, { floor: 0, ceiling: Infinity });
		expect(pos.get('a')).toBe(0);
		expect(pos.get('b')).toBe(66);
		expect(overlaps(items, pos, 6)).toBe(false);
	});

	it('lifts the chain rather than pushing a card past the bottom', () => {
		const items = [item('a', 100), item('b', 180)];
		const pos = stackRailItems(items, 'a', 6, { floor: 0, ceiling: 220 });
		expect(pos.get('b')).toBe(160);
		expect(pos.get('a')).toBe(94);
		expect(overlaps(items, pos, 6)).toBe(false);
	});

	it('keeps the top when there is no room for both ends', () => {
		const items = [item('a', 0, 100), item('b', 10, 100)];
		const pos = stackRailItems(items, 'b', 6, { floor: 0, ceiling: 150 });
		expect(pos.get('a')).toBe(0);
		expect(pos.get('b')).toBe(50);
	});
});
