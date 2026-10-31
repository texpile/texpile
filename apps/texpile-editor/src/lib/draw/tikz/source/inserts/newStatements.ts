import { indentAt, lineStart } from '../sourceText';
import { renamePastedNames } from '../arrange/pastedNames';
import { axisFor } from '../plots/plotOptions';
import { ensureNodeName, nodeShapeOptions } from '../nodes';
import { withLibrary, withPackage } from '../options/libraries';
import { circuitPart, NODE_NAME_STEMS } from '../circuits/circuitParts';
import { readPicture, type Picture } from '../picture';
import type { ConnectorRoute, Endpoint, NewShape } from '$lib/draw/editor/figure/figureLanguage';
import { curveControls, simplifyStroke, type Point } from '$lib/draw/editor/figure/geometry';
import { formatNumber, formatPoint } from '$lib/draw/editor/figure/numbers';

/** a plain point, or a node the path starts or ends at, by name; TikZ then clips the path to the node's border, or
 *  starts it at the anchor */
type NamedEndpoint = Point | { node: string; at: Point; anchor?: string | null };

/** a new shape with its node endpoints named */
export type TikzShape =
	| Exclude<NewShape, { tool: 'line' | 'arrow' | 'curve' | 'state' | 'component' }>
	| { tool: 'line' | 'arrow' | 'curve'; from: NamedEndpoint; to: NamedEndpoint; route?: ConnectorRoute; via?: Point[] }
	| { tool: 'state'; at: Point; name: string; text: string }
	| { tool: 'component'; part: string; from: NamedEndpoint; to: NamedEndpoint }
	| { tool: 'component'; part: string; at: Point; name: string | null };

function endText(e: NamedEndpoint) {
	return 'node' in e ? `(${e.node}${e.anchor ? `.${e.anchor}` : ''})` : formatPoint(e);
}
function positionOf(e: NamedEndpoint): Point {
	return 'node' in e ? e.at : e;
}

export function statementFor(shape: TikzShape) {
	if ((shape.tool === 'line' || shape.tool === 'arrow') && shape.route?.startsWith('loop'))
		return `\\draw${shape.tool === 'arrow' ? '[->]' : ''} ${endText(shape.from)} to[${shape.route}] ${endText(shape.to)};`;
	switch (shape.tool) {
		case 'plot':
			return axisFor(shape.at);
		case 'state':
			return `\\node[state] (${shape.name}) at ${formatPoint(shape.at)} {${shape.text}};`;
		case 'component':
			if ('at' in shape) return `\\node[${shape.part}]${shape.name ? ` (${shape.name})` : ''} at ${formatPoint(shape.at)} {};`;
			return `\\draw ${endText(shape.from)} to[${shape.part}] ${endText(shape.to)};`;
		case 'line':
		case 'arrow': {
			const points = [endText(shape.from), ...(shape.via ?? []).map(formatPoint), endText(shape.to)];
			return `\\draw${shape.tool === 'arrow' ? '[->]' : ''} ${points.join(' -- ')};`;
		}
		case 'rect':
			return `\\draw ${formatPoint(shape.from)} rectangle ${formatPoint(shape.to)};`;
		case 'box': {
			const [w, h] = [Math.abs(shape.to[0] - shape.from[0]), Math.abs(shape.to[1] - shape.from[1])];
			const at: Point = [(shape.from[0] + shape.to[0]) / 2, (shape.from[1] + shape.to[1]) / 2];
			const outline = nodeShapeOptions(shape.shape ?? 'rectangle').items;
			const size = [`minimum width=${formatNumber(w)}cm`, `minimum height=${formatNumber(h)}cm`];
			const turned = shape.angle ? [`rotate=${formatNumber(shape.angle)}`] : [];
			return `\\node[${['draw', ...outline, ...size, ...turned].join(', ')}] at ${formatPoint(at)} {};`;
		}
		case 'ellipse': {
			const center: Point = [(shape.from[0] + shape.to[0]) / 2, (shape.from[1] + shape.to[1]) / 2];
			const rx = Math.abs(shape.to[0] - shape.from[0]) / 2;
			const ry = Math.abs(shape.to[1] - shape.from[1]) / 2;
			if (shape.circle) return `\\draw ${formatPoint(center)} circle [radius=${formatNumber(Math.max(rx, ry))}];`;
			return `\\draw ${formatPoint(center)} ellipse [x radius=${formatNumber(rx)}, y radius=${formatNumber(ry)}];`;
		}
		case 'curve': {
			const [c1, c2] = curveControls(positionOf(shape.from), positionOf(shape.to));
			return `\\draw ${endText(shape.from)} .. controls ${formatPoint(c1)} and ${formatPoint(c2)} .. ${endText(shape.to)};`;
		}
		case 'pen':
			return `\\draw plot[smooth] coordinates {${simplifyStroke(shape.points, 0.05).map(formatPoint).join(' ')}};`;
		case 'polygon':
			return `\\draw ${shape.points.map(formatPoint).join(' -- ')} -- cycle;`;
		case 'axes': {
			const [[u0, v0], [u1, v1]] = [shape.from, shape.to];
			const y = `${formatPoint([u0, v1])} node[${v1 >= v0 ? 'above' : 'below'}] {$y$}`;
			const x = `${formatPoint([u1, v0])} node[${u1 >= u0 ? 'right' : 'left'}] {$x$}`;
			return `\\draw[<->] ${y} -- ${formatPoint(shape.from)} -- ${x};`;
		}
		case 'text':
			return `\\node at ${formatPoint(shape.at)} {${shape.text}};`;
	}
}

/** the new statement goes last in the picture, indented like the one before it */
export function appendStatement(source: string, picture: Picture, text: string) {
	const last = picture.statements.filter((s) => !s.inScope).at(-1);
	const indent = last ? indentAt(source, last.from) : '  ';
	const endLine = lineStart(source, picture.endFrom);
	if (source.slice(endLine, picture.endFrom).trim() === '') {
		const insert = `${indent}${text.replaceAll('\n', `\n${indent}`)}\n`;
		return { source: source.slice(0, endLine) + insert + source.slice(endLine), at: endLine + indent.length };
	}
	return { source: `${source.slice(0, picture.endFrom)}${text} ${source.slice(picture.endFrom)}`, at: picture.endFrom };
}

/** a new statement last in the picture; endpoints on nodes refer to them by name, named in the same edit */
export function appendShape(source: string, pictureIndex: number, shape: NewShape) {
	let text = source;
	function named(e: Endpoint) {
		if (!('ref' in e)) return e;
		const st = readPicture(text, pictureIndex)?.statements.find((s) => s.i === e.ref);
		if (!st) return e.at;
		const ensured = ensureNodeName(text, st);
		text = ensured.source;
		return { node: ensured.name, at: e.at, anchor: e.anchor };
	}
	let tikzShape: TikzShape;
	if (shape.tool === 'line' || shape.tool === 'arrow' || shape.tool === 'curve')
		tikzShape = { tool: shape.tool, from: named(shape.from), to: named(shape.to), route: shape.route, via: shape.via };
	else if (shape.tool === 'component' && 'at' in shape) tikzShape = { ...shape, name: partName(text, shape.part) };
	else if (shape.tool === 'component') tikzShape = { ...shape, from: named(shape.from), to: named(shape.to) };
	else if (shape.tool === 'state') {
		// q0, q1 ... the first number no node in the text is named by
		let k = 0;
		while (new RegExp(`\\(\\s*q${k}\\s*\\)`).test(text)) k++;
		tikzShape = { tool: 'state', at: shape.at, name: `q${k}`, text: `$q_{${k}}$` };
	} else tikzShape = shape as TikzShape;
	const picture = readPicture(text, pictureIndex);
	if (!picture) return null;
	const added = appendStatement(text, picture, statementFor(tikzShape)).source;
	if (shape.tool === 'component') return withPackage(added, 'circuitikz');
	if (shape.tool === 'plot') return withPackage(added, 'pgfplots');
	if (shape.tool === 'state') return withLibrary(added, 'automata').source;
	const library = shape.tool === 'box' && shape.shape ? nodeShapeOptions(shape.shape).library : undefined;
	return library ? withLibrary(added, library).source : added;
}

/** a name for a new node with pins to wire to, the first of op1, op2 ... no node has; none for a part without pins */
function partName(source: string, part: string) {
	const stem = circuitPart(part)?.pins.length ? NODE_NAME_STEMS[part] : null;
	if (!stem) return null;
	let k = 1;
	while (new RegExp(`\\(\\s*${stem}${k}\\s*\\)`).test(source)) k++;
	return `${stem}${k}`;
}

/** pasted statements last in the picture: a whole picture's body, its common indent taken off */
export function appendPastedStatements(source: string, pictureIndex: number, text: string) {
	const picture = readPicture(source, pictureIndex);
	if (picture?.layout) return null;
	const body = /\\begin\{tikzpicture\}(?:\[[^\]]*\])?([\s\S]*?)\\end\{tikzpicture\}/.exec(text)?.[1] ?? text;
	// a plot outside an axis sends pgfplots round forever
	if (/\\addplot\b/.test(body) && !/\\begin\{\w*axis\}/.test(body)) return null;
	const lines = body.split('\n').filter((l) => l.trim());
	const common = Math.min(...lines.map((l) => /^[ \t]*/.exec(l)![0].length));
	if (!picture || !lines.length) return null;
	const renamed = renamePastedNames(source.slice(picture.from, picture.to), lines.map((l) => l.slice(common)).join('\n'));
	return appendStatement(source, picture, renamed).source;
}
