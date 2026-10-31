import type { Endpoint, FigureLanguage } from '$lib/draw/editor/figure/figureLanguage';
import { CETZ_COLORS } from './cetzColors';
import { describeStatement } from './describeStatement';
import { renderCetz } from './renderCetz';
import { groupStatements, moveStatements, readLabel, ungroupStatement, writeLabel } from './source/arrange/arrange';
import { brokenNeed, brokenNeedText } from './source/arrange/statementNeeds';
import { movePoint, radii } from './source/coordinates';
import { pathPoints } from './source/nodes/nodePoint';
import { appendStatement, readFrame, removeStatement, statementFor, writeFrame, type NamedEndpoint } from './source/newStatements';
import { readNodeBox, writeNodeBox } from './source/nodes/nodeBox';
import { withFinite } from './source/nodes/states';
import { ensureNodeName, freshName, freshStateName, nodeName } from './source/nodes/nodeNames';
import { CETZ_NODE_SHAPES } from './source/nodes/nodeOutline';
import { TEXT_SIZES } from './source/nodes/nodeText';
import { parseConnector, readConnector } from './source/connectors/connectorRead';
import {
	addDimension,
	readDimension,
	refreshDimensions,
	relabelDimension,
	restyledDimension
} from './source/dimensions/dimensionStatements';
import { attachConnectorEnd, refreshConnectors, writeConnector } from './source/connectors/connectorWrite';
import { addStep } from './source/moves/nextStep';
import { readPlacement, writePlacement } from './source/moves/placement';
import { readRotation, rotateStatement } from './source/moves/rotation';
import { shiftStatement } from './source/moves/statementMoves';
import { addElement, appendPasted } from './source/pasted';
import { arcRadii } from './source/shapes/arcs';
import { trimmable, writeTrimmed } from './source/shapes/trimShapes';
import { listPictures, pictureAround, readPicture, statementAt, type CetzPicture, type CetzStatement } from './source/picture';
import { NEW_PICTURE, NEW_PICTURES, replacePicture, unclosedPicture, withPicture } from './source/pictures';
import { attachEnd, letGoOf, readContentLines, stretchStatement, writeContentLines } from './source/shapeEdits';
import { ARROWS, DASHES, OPACITIES, WIDTHS, readStyle, writeStyle } from './source/styles/styles';
import { textProblem } from './source/typstText';
import { typstLanguage } from './syntax/typstLanguage';
import { typstFolds } from './syntax/typstFolds';
import { LIBRARY_ELEMENTS } from './library/libraryElements';
import { UNBACKED } from './unbacked';

const ARROW_LABELS: Record<string, string> = { '': 'none', '->': '→', '<-': '←', '<->': '↔' };

/** a group's text without a name of its own; the names in it are the group's, so its copy keeps them */
function withoutOwnName(source: string, st: CetzStatement) {
	const own = st.args.find((a) => a.name === 'name');
	if (!own) return source.slice(st.from, st.to);
	const comma = /^\s*,\s*/.exec(source.slice(own.to))?.[0].length ?? 0;
	return source.slice(st.from, own.from) + source.slice(own.to + comma, st.to);
}

function lineIndent(source: string, pos: number) {
	return /^[ \t]*/.exec(source.slice(source.lastIndexOf('\n', pos - 1) + 1))![0];
}

/** the statement as it reads in `text`, found again by its number after an edit moved it */
function statementIn(text: string, st: CetzStatement): CetzStatement | null {
	for (let k = 0; ; k++) {
		const picture = readPicture(text, k);
		if (!picture) return null;
		if (picture.from <= st.from && st.from <= picture.to) return picture.statements.find((s) => s.i === st.i) ?? null;
	}
}

/** the edit, with the connectors bent round or looped on a border written again for where their ends are now, and
 *  the dimensions for where their points are */
function refreshed(before: string, after: string, at: { from: number; to: number }) {
	const around = pictureAround(after, at);
	return around ? refreshDimensions(before, refreshConnectors(after, around.index), around.index) : after;
}

export const cetzLanguage: FigureLanguage = {
	...UNBACKED,
	id: 'cetz',
	name: 'CeTZ',
	features: ['library', 'trim', 'dimensions', 'states'],
	engineName: 'Typst',
	newPicture: NEW_PICTURE,
	newPictures: NEW_PICTURES,
	codeLanguage: [typstLanguage],
	foldRanges: typstFolds,
	listPictures,
	unclosedPicture,
	manual: { label: 'CeTZ manual', url: 'https://cetz-package.github.io/docs/' },
	withCommandAsPicture: (source) => source,
	withPicture,
	replacePicture,
	textProblem,
	readPicture,
	statementAt: (picture, pos) => statementAt(picture as CetzPicture, pos),
	describe: (source, st) => describeStatement(source, st as CetzStatement),
	render: (engine, source, picture) => renderCetz(engine, source, picture as CetzPicture),
	upToDate: (source) => source,

	libraryElements: LIBRARY_ELEMENTS,
	addElement,
	pathPoints: (source, st) => pathPoints(source, st as CetzStatement),
	radii: (source, st) => radii(source, st as CetzStatement),
	arcs: (source, st) => arcRadii(source, st as CetzStatement),
	trimmable: (source, st) => trimmable(source, st as CetzStatement),
	addDimension,
	readDimension: (source, picture, st) => readDimension(source, picture as CetzPicture, st as CetzStatement),
	relabelDimension,
	writeTrimmed: (source, st, left) => writeTrimmed(source, st as CetzStatement, left),
	movePoint: (source, points, k, to) => refreshed(source, movePoint(source, points, k, to), points[k]),
	shiftStatement: (source, st, du, dv) => refreshed(source, shiftStatement(source, st as CetzStatement, du, dv), st),
	stretchStatement: (source, st, anchor, sx, sy) => refreshed(source, stretchStatement(source, st as CetzStatement, anchor, sx, sy), st),
	duplicateStatement(source, st, du, dv) {
		const s = st as CetzStatement;
		const around = pictureAround(source, s);
		// the copy goes without the element's name, so the name still means one element; an outline's text is placed
		// on it by name, so the copy's outline takes a new one
		const name = s.text || s.command === 'finite-state' ? nodeName(source, s) : null;
		const own = source.slice(s.from, s.to);
		// a state cannot go without a name, so its copy takes the next one
		const fresh = s.command === 'finite-state' ? freshStateName(source) : freshName(source);
		const copy = name
			? own.replaceAll(`"${name}"`, `"${fresh}"`)
			: s.command === 'group'
				? withoutOwnName(source, s)
				: own.replace(/,\s*name:\s*"[^"]*"/, '');
		const text = `${source.slice(0, s.to)}\n${lineIndent(source, s.from)}${copy}${source.slice(s.to)}`;
		const added =
			around && readPicture(text, around.index)?.statements.find((x) => x.from === s.to + 1 + lineIndent(source, s.from).length);
		return added ? shiftStatement(text, added, du, dv) : text;
	},
	readRotation: (source, st) => readRotation(source, st as CetzStatement),
	rotateStatement(source, st, center, degrees) {
		const next = rotateStatement(source, st as CetzStatement, center, degrees);
		return next && refreshed(source, next, st);
	},
	removeStatement: (source, st) => removeStatement(source, st as CetzStatement),
	letGoOf: (source, pictureIndex, gone, pointOf, placeOf) => letGoOf(source, pictureIndex, gone, pointOf, placeOf),
	brokenNeed(before, after, pictureIndex) {
		const broken = brokenNeed(before, after, pictureIndex);
		return broken && brokenNeedText(broken, describeStatement(after, broken.use).title.toLowerCase());
	},
	appendStatements: appendPasted,
	moveStatements: (source, picture, ids, to) => moveStatements(source, picture as CetzPicture, ids, to),
	groupStatements: (source, picture, ids) => groupStatements(source, picture as CetzPicture, ids),
	ungroupStatement: (source, picture, id) => ungroupStatement(source, picture as CetzPicture, id),
	readLabel: (source, st) => readLabel(source, st as CetzStatement),
	writeLabel: (source, st, label) => writeLabel(source, st as CetzStatement, label),
	nameOf: (source, st) => (st.kind === 'node' ? nodeName(source, st as CetzStatement) : null),
	readNodeBox: (source, st) => readNodeBox(source, st as CetzStatement),
	writeNodeBox(source, st, change) {
		const next = writeNodeBox(source, st as CetzStatement, change);
		// a node placed beside another stays that far from it
		const placed = readPlacement(source, st as CetzStatement);
		const now = next && placed ? statementIn(next, st as CetzStatement) : null;
		return next && refreshed(source, (now && placed && writePlacement(next, now, placed)) || next, st);
	},
	readPlacement: (source, st) => readPlacement(source, st as CetzStatement),
	writePlacement(source, st, to) {
		const next = writePlacement(source, st as CetzStatement, to);
		return next && refreshed(source, next, st);
	},
	addStep,
	readConnector: (source, st) => readConnector(source, st as CetzStatement),
	writeConnector: (source, st, change) => writeConnector(source, st as CetzStatement, change),
	nodeShapes: CETZ_NODE_SHAPES,
	namedPoints: () => ({ points: [], movable: true }),
	attachEnd(source, pictureIndex, i, k, to) {
		const st = readPicture(source, pictureIndex)?.statements.find((s) => s.i === i);
		if (st && parseConnector(source, st)) return attachConnectorEnd(source, pictureIndex, i, k, to);
		return attachEnd(source, pictureIndex, i, k, to);
	},

	readNodeLines: (source, st) => readContentLines(source, st as CetzStatement),
	writeNodeLines: (source, st, lines) => writeContentLines(source, st as CetzStatement, lines),
	readText: (source, st) => readContentLines(source, st as CetzStatement)?.join('\n') ?? null,
	writeText: (source, st, text) => writeContentLines(source, st as CetzStatement, text.split('\n')),

	addShape(source, pictureIndex, shape) {
		if (!['line', 'arrow', 'curve', 'rect', 'box', 'ellipse', 'pen', 'polygon', 'text', 'state', 'axes'].includes(shape.tool)) return null;
		let text = source;
		function named(e: Endpoint): NamedEndpoint {
			if (!('ref' in e)) return e;
			const st = readPicture(text, pictureIndex)?.statements.find((s) => s.i === e.ref);
			if (!st) return e.at;
			const ensured = ensureNodeName(text, st);
			if (!ensured) return e.at;
			const on = { source: text, st };
			text = ensured.source;
			return { node: ensured.name, anchor: e.anchor ?? null, at: e.at, on };
		}
		const made =
			shape.tool === 'line' || shape.tool === 'arrow' || shape.tool === 'curve'
				? statementFor(
						{ tool: shape.tool, from: named(shape.from), to: named(shape.to), via: shape.via },
						readPicture(text, pictureIndex)?.prefix ?? '',
						text
					)
				: null;
		const picture = readPicture(text, pictureIndex);
		if (!picture) return null;
		const appended = appendStatement(text, picture, made ?? statementFor(shape as never, picture.prefix, text));
		const added = shape.tool === 'state' ? withFinite(appended) : appended;
		const last = readPicture(added, pictureIndex)?.statements.at(-1);
		const route = 'route' in shape && shape.route !== 'straight' ? shape.route : null;
		if (last && route) return writeConnector(added, last, { route }) ?? added;
		// a box drawn by three points is turned with its first side
		if (last && shape.tool === 'box' && shape.angle) {
			const center: [number, number] = [(shape.from[0] + shape.to[0]) / 2, (shape.from[1] + shape.to[1]) / 2];
			return rotateStatement(added, last, center, shape.angle) ?? added;
		}
		return added;
	},

	readFrame(source, picture) {
		const frame = readFrame(source, picture as CetzPicture);
		const st = picture.statements.find((s) => s.kind === 'frame');
		return frame && st ? { ...frame, i: st.i } : null;
	},
	writeFrame: (source, picture, rect) => writeFrame(source, picture as CetzPicture, rect),

	readStyle: (source, st) => (st.kind === 'path' || st.kind === 'node' ? readStyle(source, st as CetzStatement) : null),
	writeStyle(source, st, change) {
		const next = writeStyle(source, st as CetzStatement, change, (text) => statementIn(text, st as CetzStatement));
		const around = next && pictureAround(next, st);
		return next && around ? restyledDimension(next, around.index, st.i) : next;
	},
	styleChoices: {
		colors: CETZ_COLORS,
		widths: WIDTHS,
		dashes: DASHES,
		arrows: ARROWS.map((a) => ({ value: a, label: ARROW_LABELS[a] })),
		textSizes: TEXT_SIZES,
		opacities: OPACITIES
	}
};
