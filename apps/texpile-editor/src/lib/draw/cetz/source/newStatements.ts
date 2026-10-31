import { freshStateName } from './nodes/nodeNames';
import type { FigureFrame, NodeShape } from '$lib/draw/editor/figure/figureLanguage';
import { curveControls, simplifyStroke, type Point } from '$lib/draw/editor/figure/geometry';
import { formatNumber } from '$lib/draw/editor/figure/numbers';
import { writtenPoints, writePair } from './coordinates';
import { writeElementRef } from './nodes/nodeAnchors';
import { freshName } from './nodes/nodeNames';
import { outlineCall } from './nodes/nodeOutline';
import type { CetzPicture, CetzStatement } from './picture';

/** a plain point, or a named element the path starts or ends at, at one of its anchors or its middle */
export type NamedEndpoint = Point | { node: string; anchor: string | null; at: Point; on: { source: string; st: CetzStatement } };

/** what the drawing tools make that CeTZ writes */
export type CetzShape =
	| { tool: 'line' | 'arrow' | 'curve'; from: NamedEndpoint; to: NamedEndpoint; via?: Point[] }
	| { tool: 'rect' | 'axes'; from: Point; to: Point }
	| { tool: 'box'; from: Point; to: Point; shape?: NodeShape }
	| { tool: 'ellipse'; from: Point; to: Point; circle: boolean }
	| { tool: 'pen' | 'polygon'; points: Point[] }
	| { tool: 'text'; at: Point; text: string }
	| { tool: 'state'; at: Point };

function endText(e: NamedEndpoint) {
	return 'node' in e ? writeElementRef(e.node, e.anchor, e.on) : writePair(e);
}
function positionOf(e: NamedEndpoint): Point {
	return 'node' in e ? e.at : e;
}

/** the new statement, calling draw functions the way the picture does (`line`, `draw.line`) */
export function statementFor(shape: CetzShape, prefix: string, source: string) {
	function call(name: string, args: string) {
		return `${prefix}${name}(${args})`;
	}
	switch (shape.tool) {
		case 'line':
		case 'arrow': {
			const through = [endText(shape.from), ...(shape.via ?? []).map(writePair), endText(shape.to)].join(', ');
			return call('line', shape.tool === 'arrow' ? `${through}, mark: (end: "straight")` : through);
		}
		case 'curve': {
			const [c1, c2] = curveControls(positionOf(shape.from), positionOf(shape.to));
			return call('bezier', `${endText(shape.from)}, ${endText(shape.to)}, ${writePair(c1)}, ${writePair(c2)}`);
		}
		case 'rect':
			return call('rect', `${writePair(shape.from)}, ${writePair(shape.to)}`);
		case 'box': {
			// the outline and its text, as one node: the text placed on the outline by its name
			const name = freshName(source);
			const center: Point = [(shape.from[0] + shape.to[0]) / 2, (shape.from[1] + shape.to[1]) / 2];
			const [w, h] = [Math.abs(shape.to[0] - shape.from[0]), Math.abs(shape.to[1] - shape.from[1])];
			return `${outlineCall(prefix, shape.shape ?? 'rectangle', center, w, h, [`name: "${name}"`])}; ${call('content', `"${name}", []`)}`;
		}
		case 'polygon':
			return call('line', `${shape.points.map(writePair).join(', ')}, close: true`);
		case 'ellipse': {
			const center: Point = [(shape.from[0] + shape.to[0]) / 2, (shape.from[1] + shape.to[1]) / 2];
			const rx = Math.abs(shape.to[0] - shape.from[0]) / 2;
			const ry = Math.abs(shape.to[1] - shape.from[1]) / 2;
			const radius = shape.circle ? formatNumber(Math.max(rx, ry)) : `(${formatNumber(rx)}, ${formatNumber(ry)})`;
			return call('circle', `${writePair(center)}, radius: ${radius}`);
		}
		case 'pen':
			return call('catmull', simplifyStroke(shape.points, 0.05).map(writePair).join(', '));
		case 'text':
			return call('content', `${writePair(shape.at)}, [${shape.text}]`);
		case 'axes': {
			// one arrow through the corner, labeled at its ends, as TikZ's axes are one path
			const [[u0, v0], [u1, v1]] = [shape.from, shape.to];
			const y = call('content', `${writePair([u0, v1])}, [$y$], anchor: "${v1 >= v0 ? 'south' : 'north'}", padding: 0.1`);
			const x = call('content', `${writePair([u1, v0])}, [$x$], anchor: "${u1 >= u0 ? 'west' : 'east'}", padding: 0.1`);
			const line = call(
				'line',
				`${writePair([u0, v1])}, ${writePair(shape.from)}, ${writePair([u1, v0])}, mark: (start: "straight", end: "straight")`
			);
			return `${prefix}group({\n  ${line}\n  ${y}\n  ${x}\n})`;
		}
		case 'state': {
			const name = freshStateName(source);
			return `finite.draw.state(${writePair(shape.at)}, "${name}", label: [$q_${name.slice(1)}$])`;
		}
	}
}

function lineStart(source: string, pos: number) {
	return source.lastIndexOf('\n', pos - 1) + 1;
}

/** the new statement goes last in the canvas's body, indented like the one before it */
export function appendStatement(source: string, picture: CetzPicture, text: string) {
	const last = picture.statements.filter((s) => !s.inScope).at(-1);
	const indent = last ? /^[ \t]*/.exec(source.slice(lineStart(source, last.from)))![0] : '  ';
	const lines = text.replaceAll('\n', `\n${indent}`);
	const endLine = lineStart(source, picture.endFrom);
	if (source.slice(endLine, picture.endFrom).trim() === '') return source.slice(0, endLine) + `${indent}${lines}\n` + source.slice(endLine);
	return `${source.slice(0, picture.endFrom)}\n${indent}${lines}\n${source.slice(picture.endFrom)}`;
}

/** a statement alone on its line takes the line with it */
export function removeStatement(source: string, st: CetzStatement) {
	const start = lineStart(source, st.from);
	const nl = source.indexOf('\n', st.to);
	const end = nl < 0 ? source.length : nl;
	if (source.slice(start, st.from).trim() === '' && source.slice(st.to, end).trim() === '')
		return source.slice(0, start) + source.slice(Math.min(end + 1, source.length));
	return source.slice(0, st.from) + source.slice(st.to).replace(/^\s*;?[ \t]?/, '');
}

/** a top-level invisible `rect(a, b, stroke: none)`: the canvas's fixed size */
export function readFrame(source: string, picture: CetzPicture): FigureFrame | null {
	const st = picture.statements.find((s) => s.kind === 'frame' && !s.inScope);
	const corners = st ? writtenPoints(source, st) : [];
	if (corners.length !== 2) return null;
	const [p, q] = corners;
	return { x1: Math.min(p.x, q.x), y1: Math.min(p.y, q.y), x2: Math.max(p.x, q.x), y2: Math.max(p.y, q.y) };
}

export function writeFrame(source: string, picture: CetzPicture, rect: FigureFrame) {
	const a = writePair([rect.x1, rect.y1]);
	const b = writePair([rect.x2, rect.y2]);
	const st = picture.statements.find((s) => s.kind === 'frame' && !s.inScope);
	const corners = st ? writtenPoints(source, st) : [];
	if (corners.length === 2) {
		const [p, q] = corners;
		return source.slice(0, p.from) + a + source.slice(p.to, q.from) + b + source.slice(q.to);
	}
	// first among the drawing statements, after the imports and settings the frame's `rect` may need
	const text = `${picture.prefix}rect(${a}, ${b}, stroke: none)`;
	const first = picture.statements.find((s) => !s.inScope && s.kind !== 'other');
	if (!first) return appendStatement(source, picture, text);
	const indent = source.slice(lineStart(source, first.from), first.from);
	return /^[ \t]*$/.test(indent)
		? `${source.slice(0, first.from)}${text}\n${indent}${source.slice(first.from)}`
		: `${source.slice(0, first.from)}${text}; ${source.slice(first.from)}`;
}
