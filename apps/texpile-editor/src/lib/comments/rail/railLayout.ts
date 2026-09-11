// Where each card sits in the margin: at its anchor when it can, pushed out of the way when two

export type RailItem = {
	id: string;
	anchor: number;
	height: number;
};

export type RailBounds = {
	floor: number;
	ceiling: number;
};

const UNBOUNDED: RailBounds = { floor: Number.NEGATIVE_INFINITY, ceiling: Number.POSITIVE_INFINITY };

export function stackRailItems(
	items: RailItem[],
	activeId: string | null,
	gap: number,
	bounds: RailBounds = UNBOUNDED
): Map<string, number> {
	const out = new Map<string, number>();
	if (items.length === 0) return out;
	const sorted = [...items].sort((a, b) => a.anchor - b.anchor);
	const tops = new Array<number>(sorted.length);
	let ai = sorted.findIndex((i) => i.id === activeId);
	if (ai < 0) ai = 0;
	tops[ai] = sorted[ai].anchor;
	for (let i = ai - 1; i >= 0; i--) {
		const limit = tops[i + 1] - gap;
		tops[i] = Math.min(sorted[i].anchor, limit - sorted[i].height);
	}
	for (let i = ai + 1; i < sorted.length; i++) {
		tops[i] = Math.max(sorted[i].anchor, tops[i - 1] + sorted[i - 1].height + gap);
	}
	if (tops[0] < bounds.floor) {
		tops[0] = bounds.floor;
		for (let i = 1; i < sorted.length; i++) tops[i] = Math.max(tops[i], tops[i - 1] + sorted[i - 1].height + gap);
	}
	const last = sorted.length - 1;
	if (tops[last] + sorted[last].height > bounds.ceiling) {
		tops[last] = Math.max(bounds.floor, bounds.ceiling - sorted[last].height);
		for (let i = last - 1; i >= 0; i--) tops[i] = Math.max(bounds.floor, Math.min(tops[i], tops[i + 1] - gap - sorted[i].height));
	}
	sorted.forEach((it, i) => out.set(it.id, tops[i]));
	return out;
}
