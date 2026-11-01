// a connector's ends stay on the borders of the boxes it joins, whatever is done to them: Typst draws each one, and
// an end at a box's middle, as a loop drawn inside it, is found
import { describe, expect, it } from 'vitest';
import { hasTinymist, tinymistEngine, useTinymist } from '../../engines/tinymistEngine';
import type { ConnectorRoute, NodeShape } from '$lib/draw/editor/figure/figureLanguage';
import type { DrawnPart } from '$lib/draw/editor/drawing/drawing.types';
import { cetzLanguage as lang } from '$lib/draw/cetz/cetzLanguage';

const SHAPES: NodeShape[] = ['rectangle', 'rounded', 'terminal', 'circle', 'ellipse', 'diamond', 'slant'];
const ROUTES: ConnectorRoute[] = ['straight', 'hv', 'vh', 'bend left', 'bend right', 'curve', 'loop above', 'loop right'];
const EDITS = ['as drawn', 'moved', 'resized', 'reshaped', 'turned'] as const;

function numbers(parts: DrawnPart[]) {
	return parts.flatMap((p) => (p.kind === 'path' ? (p.d.match(/-?\d*\.?\d+(?:e-?\d+)?/g) ?? []).map(Number) : []));
}

/** the middle and the smaller half size of what a statement draws */
function extent(parts: DrawnPart[]) {
	const n = numbers(parts);
	const [xs, ys] = [n.filter((_, k) => k % 2 === 0), n.filter((_, k) => k % 2 === 1)];
	const [x0, x1, y0, y1] = [Math.min(...xs), Math.max(...xs), Math.min(...ys), Math.max(...ys)];
	return { center: [(x0 + x1) / 2, (y0 + y1) / 2], half: Math.min(x1 - x0, y1 - y0) / 2 };
}

describe.skipIf(!hasTinymist)('connector geometry', () => {
	useTinymist();
	const engine = tinymistEngine;

	it('keeps every end of every route on its box border, as drawn, moved, resized and reshaped', async () => {
		const misses: string[] = [];
		for (const shape of SHAPES)
			for (const route of ROUTES) {
				const loop = route.startsWith('loop');
				let base = lang.addShape(lang.newPicture, 0, { tool: 'box', from: [2, 2], to: [4, 3.5], shape })!;
				if (!loop) base = lang.addShape(base, 0, { tool: 'box', from: [8, 5], to: [10, 6.5], shape: 'rectangle' })!;
				const nodes = lang
					.readPicture(base, 0)!
					.statements.filter((s) => s.kind === 'node')
					.map((s) => s.i);
				const [a, b] = [nodes[0], nodes.at(-1)!];
				const ends = {
					from: { ref: a, at: [3, 2.75] as [number, number] },
					to: { ref: b, at: loop ? ([3, 2.75] as [number, number]) : ([9, 5.75] as [number, number]) }
				};
				base = lang.addShape(base, 0, { tool: 'arrow', ...ends, route })!;
				for (const edit of EDITS) {
					const node = lang.readPicture(base, 0)!.statements.find((s) => s.i === a)!;
					const text =
						edit === 'moved'
							? lang.shiftStatement(base, node, 1, 0.5)
							: edit === 'resized'
								? lang.writeNodeBox(base, node, { w: 3, h: 2.5 })
								: edit === 'reshaped'
									? lang.writeNodeBox(base, node, { shape: shape === 'diamond' ? 'ellipse' : 'diamond' })
									: edit === 'turned'
										? lang.rotateStatement(base, node, [3, 2.75], 30)
										: base;
					const picture = text && lang.readPicture(text, 0);
					if (!text || !picture) {
						misses.push(`${shape} ${route} ${edit}: refused`);
						continue;
					}
					const drawn = await lang.render(engine, text, picture);
					const connector = picture.statements.at(-1)!.i;
					const line = numbers(drawn.drawing.parts.filter((p) => p.stmt === connector));
					// its own path's first and last points; the arrowhead is drawn after it
					const path = drawn.drawing.parts.find((p) => p.stmt === connector && p.kind === 'path');
					const own = path ? numbers([path]) : line;
					const tips = [own.slice(0, 2), own.slice(-2)];
					for (const [k, ref] of (loop ? [a, a] : [a, b]).entries()) {
						const box = extent(drawn.drawing.parts.filter((p) => p.stmt === ref));
						const d = Math.hypot(tips[k][0] - box.center[0], tips[k][1] - box.center[1]);
						if (d < box.half * 0.6)
							misses.push(`${shape} ${route} ${edit}: end ${k} ${d.toFixed(1)}bp from the middle of a box ${box.half.toFixed(1)}bp across`);
					}
				}
			}
		expect(misses).toEqual([]);
	}, 300_000);
});
