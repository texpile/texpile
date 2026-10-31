import type { NodeBox, NodeBoxChange, NodeShape } from '$lib/draw/editor/figure/figureLanguage';
import type { Point } from '$lib/draw/editor/figure/geometry';
import { writePair } from '../coordinates';
import { namedArg, pictureAround, readPicture, type CetzStatement } from '../picture';
import { stretchStatement } from '../shapeEdits';
import { readPair } from '../syntax';
import { borderAngle, readElementRef, writeBorderRef, writeElementRef } from './nodeAnchors';
import { freshName, nodeName } from './nodeNames';
import { readState, writeState } from './states';
import { isGeometryArg, outlineCall, readOutline } from './nodeOutline';

/** how the statement calls draw functions: '' after `import draw: *`, else `draw.` or `cetz.draw.` */
export function callPrefix(source: string, st: CetzStatement) {
	// a finite state is not CeTZ's own: what is drawn from it is called as the picture calls draw functions
	if (st.command === 'finite-state') return pictureAround(source, st)?.picture.prefix ?? '';
	return st.open < 0 ? '' : source.slice(st.inner.from, st.open - st.command.length);
}

function frameOf(source: string, st: CetzStatement) {
	const frame = namedArg(source, st, 'frame')?.text;
	return frame === '"circle"' ? 'circle' : frame === '"rect"' ? 'rectangle' : null;
}

/** text alone: where it is, its size when it is given two corners, and its text as written */
function placedText(source: string, st: CetzStatement) {
	const positional = st.args.filter((a) => !a.name);
	const corners = positional.slice(0, -1).map((a) => readPair(source.slice(a.value.from, a.value.to)));
	if (!corners.length || corners.some((c) => !c)) return null;
	const [p, q] = corners as Point[];
	const center: Point = q ? [(p[0] + q[0]) / 2, (p[1] + q[1]) / 2] : p;
	const size = q ? { w: Math.abs(q[0] - p[0]), h: Math.abs(q[1] - p[1]) } : null;
	const body = positional.at(-1)!;
	return { center, size, body: source.slice(body.value.from, body.value.to) };
}

export function readNodeBox(source: string, st: CetzStatement): NodeBox | null {
	if (st.kind !== 'node') return null;
	if (st.command === 'finite-state') return readState(source, st);
	if (st.text) {
		const outline = readOutline(source, st);
		return outline?.shape ? { shape: outline.shape, w: outline.w, h: outline.h, state: null } : null;
	}
	const size = placedText(source, st)?.size;
	return { shape: frameOf(source, st) ?? 'rectangle', w: size?.w ?? null, h: size?.h ?? null, state: null };
}

/** a size for text with none, from how long its lines are */
function textSize(body: string) {
	const lines = body.split(/\s*\\\s+/);
	const longest = Math.max(...lines.map((l) => l.length));
	return {
		w: Math.max(1, Math.round((0.22 * longest + 0.6) * 10) / 10),
		h: Math.max(0.8, Math.round((0.45 * lines.length + 0.4) * 10) / 10)
	};
}

/** text alone drawn in an outline: its own name, border and background go to the outline */
function outlinedText(source: string, st: CetzStatement, shape: NodeShape, w: number | null, h: number | null) {
	const placed = placedText(source, st);
	if (!placed) return null;
	const guess = placed.size ?? textSize(placed.body);
	const name = namedArg(source, st, 'name')?.text.replace(/^"|"$/g, '') ?? freshName(source);
	const named = st.args.filter((a) => a.name);
	const carried = named.filter((a) => a.name === 'stroke' || a.name === 'fill').map((a) => source.slice(a.from, a.to));
	const kept = named
		.filter((a) => !['stroke', 'fill', 'frame', 'padding', 'name'].includes(a.name!))
		.map((a) => source.slice(a.from, a.to));
	const prefix = callPrefix(source, st);
	const outline = outlineCall(prefix, shape, placed.center, w ?? guess.w, h ?? guess.h, [...carried, `name: "${name}"`]);
	const text = `${prefix}content(${[`"${name}"`, placed.body, ...kept].join(', ')})`;
	return `${source.slice(0, st.inner.from)}${outline}; ${text}${source.slice(st.inner.to)}`;
}

/** an outlined node back to text in a frame, which takes its size from the text, as a node with no minimum size */
function framedText(source: string, st: CetzStatement, shape: 'rectangle' | 'circle', center: Point) {
	const text = st.text!;
	const style = st.args.filter((a) => !isGeometryArg(a)).map((a) => source.slice(a.from, a.to));
	const own = text.args.filter((a) => a.name).map((a) => source.slice(a.from, a.to));
	const body = text.args.filter((a) => !a.name).at(-1)!;
	const frame = `frame: "${shape === 'circle' ? 'circle' : 'rect'}"`;
	const args = [writePair(center), source.slice(body.value.from, body.value.to), frame, 'padding: 0.1', ...style, ...own];
	return `${source.slice(0, st.inner.from)}${callPrefix(source, st)}content(${args.join(', ')})${source.slice(st.inner.to)}`;
}

/** the points others take from the node at its anchors, wherever they are written, written again for its outline as
 *  it is after the edit */
function keepAnchors(before: string, st: CetzStatement, after: string) {
	const name = nodeName(before, st);
	const around = pictureAround(before, st);
	const picture = name && around ? readPicture(after, around.index) : null;
	const now = picture?.statements.find((s) => s.i === st.i);
	if (!picture || !now || !name) return after;
	const quoted = new RegExp(`"${name}\\.[^"]+"`, 'g');
	const [wasAt, nowAt] = [readOutline(before, st)?.center, readOutline(after, now)?.center];
	// a point of the border goes out the same way from the middle of the outline as it is now
	function written(text: string) {
		const was = readElementRef(text, { source: before, st })!;
		if (was.anchor !== null) return writeElementRef(name!, was.anchor, { source: after, st: now! });
		const angle = wasAt && nowAt ? borderAngle(text, { source: before, st, center: wasAt }) : null;
		return angle === null ? text : writeBorderRef(name!, angle, { source: after, st: now!, center: nowAt! });
	}
	const edits = picture.statements.flatMap((other) =>
		other === now || other.kind === 'scope'
			? []
			: [...after.slice(other.from, other.to).matchAll(quoted)].map((m) => {
					const from = other.from + m.index!;
					return { from, to: from + m[0].length, text: written(m[0]) };
				})
	);
	return edits.sort((a, b) => b.from - a.from).reduce((out, e) => out.slice(0, e.from) + e.text + out.slice(e.to), after);
}

/** the node in another outline, or sized; a size cleared lets a box or a circle follow its text again */
export function writeNodeBox(source: string, st: CetzStatement, change: NodeBoxChange) {
	const after = writtenNodeBox(source, st, change);
	return after && keepAnchors(source, st, after);
}

function writtenNodeBox(source: string, st: CetzStatement, change: NodeBoxChange) {
	if (st.command === 'finite-state') {
		const index = pictureAround(source, st)?.index ?? 0;
		return writeState(source, st, change, (text) => readPicture(text, index)?.statements.find((s) => s.i === st.i) ?? null);
	}
	if (st.kind !== 'node') return null;
	if (!st.text) {
		const shape = change.shape ?? readNodeBox(source, st)!.shape;
		if (change.w || change.h) return outlinedText(source, st, shape, change.w ?? null, change.h ?? null);
		if (shape !== 'rectangle' && shape !== 'circle') return outlinedText(source, st, shape, null, null);
		const frame = `frame: "${shape === 'circle' ? 'circle' : 'rect'}"`;
		const at = st.args.find((a) => a.name === 'frame');
		if (at) return source.slice(0, at.from) + frame + source.slice(at.to);
		const padding = st.args.some((a) => a.name === 'padding') ? '' : ', padding: 0.1';
		return `${source.slice(0, st.args.at(-1)!.to)}, ${frame}${padding}${source.slice(st.args.at(-1)!.to)}`;
	}
	const outline = readOutline(source, st);
	if (!outline) return null;
	const shape = change.shape ?? outline.shape;
	if ((change.w === null || change.h === null) && (shape === 'rectangle' || shape === 'circle'))
		return framedText(source, st, shape, outline.center);
	let [w, h] = [change.w ?? outline.w, change.h ?? outline.h];
	if (shape === 'circle') w = h = change.w ?? change.h ?? Math.max(w, h);
	if (!shape) return stretchStatement(source, st, outline.center, outline.w ? w / outline.w : 1, outline.h ? h / outline.h : 1);
	const rest = st.args.filter((a) => !isGeometryArg(a)).map((a) => source.slice(a.from, a.to));
	return (
		source.slice(0, st.inner.from) + outlineCall(callPrefix(source, st), shape, outline.center, w, h, rest) + source.slice(st.close + 1)
	);
}
