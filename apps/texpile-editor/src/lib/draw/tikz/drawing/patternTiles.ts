import type { EnginePattern } from '$lib/draw/tikz/tikzResult';
import type { PatternTile } from '$lib/draw/editor/drawing/drawing.types';
import { PdfGraphics } from './pdfGraphics';

/** `color` paints a tile that sets none of its own */
export function patternTile(pattern: EnginePattern, color: string): PatternTile {
	const g = new PdfGraphics([0, 0]);
	g.runOperators(pattern.ops);
	function paint(own: string | null) {
		return own && (pattern.colored ? own : color);
	}
	return {
		width: pattern.step[0],
		height: pattern.step[1],
		matrix: pattern.m,
		paths: g.parts.flatMap((p) =>
			p.kind === 'path'
				? [
						{
							d: p.d,
							fill: paint(p.fill),
							stroke: paint(p.stroke),
							strokeWidth: p.strokeWidth,
							evenOdd: p.evenOdd,
							cap: p.cap,
							join: p.join
						}
					]
				: []
		)
	};
}
