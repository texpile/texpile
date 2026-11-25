// Lucide icons drawn as paths: the icon's own 24 unit nodes, stroked in the text color
import type { ReplacedContent } from '../../contracts/faceTypes';
import { canvasFill } from '../../style/resolve/colorValue';

type IconNode = readonly (readonly [string, Readonly<Record<string, string>>])[];

// copied from @lucide/svelte (ISC): the icons the canvas faces draw
const ICON_NODES: Readonly<Record<string, IconNode>> = {
	settings: [
		[
			'path',
			{
				d: 'M9.671 4.136a2.34 2.34 0 0 1 4.659 0 2.34 2.34 0 0 0 3.319 1.915 2.34 2.34 0 0 1 2.33 4.033 2.34 2.34 0 0 0 0 3.831 2.34 2.34 0 0 1-2.33 4.033 2.34 2.34 0 0 0-3.319 1.915 2.34 2.34 0 0 1-4.659 0 2.34 2.34 0 0 0-3.32-1.915 2.34 2.34 0 0 1-2.33-4.033 2.34 2.34 0 0 0 0-3.831A2.34 2.34 0 0 1 6.35 6.051a2.34 2.34 0 0 0 3.319-1.915'
			}
		],
		['circle', { cx: '12', cy: '12', r: '3' }]
	],
	tag: [
		[
			'path',
			{
				d: 'M12.586 2.586A2 2 0 0 0 11.172 2H4a2 2 0 0 0-2 2v7.172a2 2 0 0 0 .586 1.414l8.704 8.704a2.426 2.426 0 0 0 3.42 0l6.58-6.58a2.426 2.426 0 0 0 0-3.42z'
			}
		],
		['circle', { cx: '7.5', cy: '7.5', r: '.5', fill: 'currentColor' }]
	],
	shapes: [
		['path', { d: 'M8.3 10a.7.7 0 0 1-.626-1.079L11.4 3a.7.7 0 0 1 1.198-.043L16.3 8.9a.7.7 0 0 1-.572 1.1Z' }],
		['rect', { x: '3', y: '14', width: '7', height: '7', rx: '1' }],
		['circle', { cx: '17.5', cy: '17.5', r: '3.5' }]
	],
	pencil: [
		[
			'path',
			{
				d: 'M21.174 6.812a1 1 0 0 0-3.986-3.987L3.842 16.174a2 2 0 0 0-.5.83l-1.321 4.352a.5.5 0 0 0 .623.622l4.353-1.32a2 2 0 0 0 .83-.497z'
			}
		],
		['path', { d: 'm15 5 4 4' }]
	],
	'file-symlink': [
		[
			'path',
			{
				d: 'M4 11V4a2 2 0 0 1 2-2h8a2.4 2.4 0 0 1 1.706.706l3.588 3.588A2.4 2.4 0 0 1 20 8v12a2 2 0 0 1-2 2H6a2 2 0 0 1-2-2v-3a2 2 0 0 1 2-2h7'
			}
		],
		['path', { d: 'M14 2v5a1 1 0 0 0 1 1h5' }],
		['path', { d: 'm10 18 3-3-3-3' }]
	]
};

const GRID = 24;

function shapeOf(tag: string, attrs: Readonly<Record<string, string>>): Path2D | null {
	function number(name: string): number {
		return Number(attrs[name] ?? 0);
	}
	const path = new Path2D();
	switch (tag) {
		case 'path':
			return new Path2D(attrs.d);
		case 'circle':
			path.arc(number('cx'), number('cy'), number('r'), 0, Math.PI * 2);
			return path;
		case 'ellipse':
			path.ellipse(number('cx'), number('cy'), number('rx'), number('ry'), 0, 0, Math.PI * 2);
			return path;
		case 'line':
			path.moveTo(number('x1'), number('y1'));
			path.lineTo(number('x2'), number('y2'));
			return path;
		case 'rect':
			path.roundRect(number('x'), number('y'), number('width'), number('height'), number('rx') || number('ry'));
			return path;
		case 'polyline':
		case 'polygon': {
			const points = (attrs.points ?? '')
				.trim()
				.split(/[\s,]+/)
				.map(Number);
			for (let i = 0; i + 1 < points.length; i += 2) {
				if (i) path.lineTo(points[i], points[i + 1]);
				else path.moveTo(points[i], points[i + 1]);
			}
			if (tag === 'polygon') path.closePath();
			return path;
		}
		default:
			return null;
	}
}

/** a Lucide icon at a size in CSS px; the element's own width and height, when its look gives them, scale it */
export function iconContent(name: string, size: number): ReplacedContent {
	const node = ICON_NODES[name];
	return {
		intrinsic: () => ({ width: size, height: size }),
		paint(ctx, box, style) {
			if (!node) return;
			const scale = Math.min(box.width, box.height) / GRID;
			ctx.save();
			ctx.translate(box.x, box.y);
			ctx.scale(scale, scale);
			Object.assign(ctx, { strokeStyle: canvasFill(style.color), lineWidth: 2, lineCap: 'round', lineJoin: 'round' });
			for (const [tag, attrs] of node) {
				const shape = shapeOf(tag, attrs);
				if (shape) ctx.stroke(shape);
			}
			ctx.restore();
		}
	};
}
