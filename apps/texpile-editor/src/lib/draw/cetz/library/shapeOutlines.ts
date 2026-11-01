import type { Point } from '$lib/draw/editor/figure/geometry';
import { formatNumber } from '$lib/draw/editor/figure/numbers';

function rad(degrees: number) {
	return (degrees * Math.PI) / 180;
}

export function pair([x, y]: Point) {
	return `(${formatNumber(x)}, ${formatNumber(y)})`;
}

export function grouped(statements: string[]) {
	return `group({\n${statements.map((s) => `  ${s}`).join('\n')}\n})`;
}

export function closedLine(points: Point[]) {
	return `line(${points.map(pair).join(', ')}, close: true)`;
}

export function regularPolygon(sides: number, radius: number, from: number): Point[] {
	return Array.from({ length: sides }, (_, k) => {
		const a = rad(from + (360 * k) / sides);
		return [radius * Math.cos(a), radius * Math.sin(a)];
	});
}

export function starPoints(points: number, outer: number, inner: number): Point[] {
	return Array.from({ length: 2 * points }, (_, k) => {
		const a = rad(90 + (180 * k) / points);
		const r = k % 2 ? inner : outer;
		return [r * Math.cos(a), r * Math.sin(a)];
	});
}

// how far each point of the starburst falls short of its ellipse, fixed as pgf seeds its own
const BURST = [0.1, 0.35, 0, 0.25, 0.05, 0.3, 0.15, 0, 0.35, 0.1, 0.25, 0, 0.3, 0.05, 0.2, 0.35, 0.1];

export function starburstPoints(rx: number, ry: number, depth: number): Point[] {
	const n = BURST.length;
	return Array.from({ length: 2 * n }, (_, k) => {
		const a = rad(90 + (180 * k) / n);
		const r = k % 2 ? 1 - depth : 1 - 0.3 * BURST[k / 2];
		return [rx * r * Math.cos(a), ry * r * Math.sin(a)];
	});
}

function turned([dx, dy]: Point, by: number, length: number): Point {
	const [c, s, d] = [Math.cos(by), Math.sin(by), Math.hypot(dx, dy)];
	return [((dx * c - dy * s) / d) * length, ((dx * s + dy * c) / d) * length];
}

export function cloudPuffs(puffs: number, rx: number, ry: number, arc: number) {
	const corners: Point[] = Array.from({ length: puffs }, (_, k) => {
		const a = rad((360 * k) / puffs);
		return [rx * Math.cos(a), ry * Math.sin(a)];
	});
	const half = rad(arc / 2);
	return corners.map((p, i) => {
		const q = corners[(i + 1) % puffs];
		const chord: Point = [q[0] - p[0], q[1] - p[1]];
		const radius = Math.hypot(...chord) / (2 * Math.sin(half));
		const reach = (4 / 3) * Math.tan(half / 2) * radius;
		const [a, b] = [turned(chord, -half, reach), turned(chord, half, reach)];
		return `bezier(${pair(p)}, ${pair(q)}, ${pair([p[0] + a[0], p[1] + a[1]])}, ${pair([q[0] - b[0], q[1] - b[1]])})`;
	});
}
