import type { Picture, Statement } from './picture';
import type { FigureFrame, PointSpan } from '$lib/draw/editor/figure/figureLanguage';
import { formatPoint } from '$lib/draw/editor/figure/numbers';
import { pathPoints } from './coordinates';
import { appendStatement } from './inserts/newStatements';
import { lineStart } from './sourceText';

export type Frame = { x1: number; y1: number; x2: number; y2: number; i: number; statement: Statement; corners: PointSpan[] };

/** a top-level `\useasboundingbox (a,b) rectangle (c,d)`: the picture's fixed size in the document */
export function readFrame(source: string, picture: Picture): Frame | null {
	const st = picture.statements.find((s) => s.kind === 'frame' && !s.inScope);
	if (!st || !/rectangle/.test(source.slice(st.from, st.to))) return null;
	// the far corner may be written from the near one, `rectangle ++(4,3)`
	const corners = pathPoints(source, st);
	if (corners.length !== 2 || corners[0].relative) return null;
	const [p, q] = corners;
	return {
		x1: Math.min(p.x, q.x),
		y1: Math.min(p.y, q.y),
		x2: Math.max(p.x, q.x),
		y2: Math.max(p.y, q.y),
		i: st.i,
		statement: st,
		corners
	};
}

export function writeFrame(source: string, picture: Picture, rect: FigureFrame) {
	const frame = readFrame(source, picture);
	const a = formatPoint([rect.x1, rect.y1]);
	let b = formatPoint([rect.x2, rect.y2]);
	if (frame) {
		const [p, q] = frame.corners;
		if (q.relative) b = formatPoint([rect.x2 - rect.x1, rect.y2 - rect.y1]);
		return source.slice(0, p.from) + a + source.slice(p.to, q.from) + b + source.slice(q.to);
	}
	const first = picture.statements[0];
	const text = `\\useasboundingbox ${a} rectangle ${b};`;
	if (!first) return appendStatement(source, picture, text).source;
	const indent = source.slice(lineStart(source, first.from), first.from);
	return /^[ \t]*$/.test(indent)
		? `${source.slice(0, first.from)}${text}\n${indent}${source.slice(first.from)}`
		: `${source.slice(0, first.from)}${text} ${source.slice(first.from)}`;
}
