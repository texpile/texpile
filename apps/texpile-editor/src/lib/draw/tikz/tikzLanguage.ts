import { latex } from '$lib/languages/latex/source/latexLanguage';
import { tikzFolds } from './syntax/tikzFolds';
import type { Endpoint, FigureLanguage, ShapeStyle } from '$lib/draw/editor/figure/figureLanguage';
import { describeStatement } from './describeStatement';
import { branchText } from './source/forest/forestEdits';
import { cellText, gridAround } from './source/cd/cdEdits';
import { bracedIf, texText, typedText } from './source/sourceText';
import { renderTikz } from './renderTikz';
import { TIKZ_COLORS } from './tikzColors';
import { diagramArrow, removeDiagramStatement, tikzDiagrams } from './tikzDiagrams';
import { tikzTrees } from './tikzTrees';
import { groupStatements, moveStatements, ungroupStatement } from './source/arrange/arrange';
import { duplicateStatement } from './source/arrange/duplicate';
import { letGoOf } from './source/arrange/letGo';
import { brokenNeed, brokenNeedText } from './source/arrange/statementNeeds';
import { readLabel, writeLabel, removeStatement } from './source/arrange/blocks';
import { readCircuit, writeCircuit } from './source/circuits/circuitOptions';
import { CIRCUIT_PARTS } from './source/circuits/circuitParts';
import { attachConnectorEnd, readConnector, writeConnector } from './source/connectors';
import { arcRadii, arcStretchEdits, mirroredBendEdits } from './source/arcs';
import { addDimension, readDimension, relabelDimension } from './source/dimensions/dimensionStatements';
import { upgradeDimensions } from './source/dimensions/dimensionUpgrade';
import { trimmable, writeTrimmed } from './source/trim/trimShapes';
import { movePoint, pathPoints, radii, stretchPoints } from './source/coordinates';
import { readFrame, writeFrame } from './source/frame';
import { namedPoints } from './source/moves/namedPoints';
import { addStep } from './source/moves/nextStep';
import { readPlacement, writePlacement } from './source/moves/placement';
import { moveWay, shiftStatement } from './source/moves/statementMoves';
import { stretchByOption } from './source/moves/optionShift';
import { stretchLoop } from './source/moves/loopShift';
import { readRotation, rotateStatement } from './source/moves/rotation';
import { NEW_PICTURE, withCommandAsPicture, withNeeds, withPicture, replacePicture } from './source/newPictures';
import { LIBRARY_ELEMENTS } from './library/libraryElements';
import { STARTER_PICTURES } from './starters/starterPictures';
import { appendPastedStatements, appendShape } from './source/newStatements';
import { readNodeBox, readNodeLines, writeNodeLines, writeNodeBox, textProblem, nodeName } from './source/nodes';
import { readCommandOptions, writeCommandOptions } from './source/options/optionList';
import {
	ARROWS,
	DASHES,
	OPACITIES,
	WIDTHS,
	readStyle,
	targetOf,
	withArrows,
	withCorners,
	withDash,
	withFill,
	withOpacity,
	withStroke,
	withWidth
} from './source/options/styleOptions';
import { TEXT_SIZES, withTextColor, withTextSize } from './source/options/textOptions';
import { listPictures, readPicture, statementAt, unclosedPicture, type Picture, type Statement } from './source/picture';
import { addPlot, readAxis, readPlot, writeAxis, writePlot } from './source/plots/plotOptions';

const ARROW_LABELS: Record<string, string> = { '': 'none', '->': '→', '<-': '←', '<->': '↔' };

function isDiagram(picture: unknown) {
	return !!(picture as Picture | null)?.layout;
}
function inDiagram(st: { kind: string }) {
	return st.kind === 'cell' || st.kind === 'arrow' || st.kind === 'branch';
}

export const tikzLanguage: FigureLanguage = {
	id: 'tikz',
	name: 'TikZ',
	engineName: 'TeX',
	features: ['library', 'dimensions', 'trim', 'states', 'plots', 'circuits'],
	newPicture: NEW_PICTURE,
	newPictures: STARTER_PICTURES,
	foldRanges: tikzFolds,
	codeLanguage: [latex()],
	listPictures,
	unclosedPicture,
	// the PGF/TikZ manual as HTML
	manual: { label: 'TikZ manual', url: 'https://tikz.dev' },
	withCommandAsPicture,
	withPicture,
	replacePicture,
	textProblem,
	readPicture,
	statementAt: (picture, pos) => statementAt(picture as Picture, pos),
	describe: (source, st) => describeStatement(source, st as Statement),
	render: (engine, source, picture) => renderTikz(engine, source, picture as Picture),

	pathPoints: (source, st) => pathPoints(source, st as Statement),
	radii: (source, st) => radii(source, st as Statement),
	arcs: (source, st) => arcRadii(source, st as Statement),
	movePoint,
	stretchStatement: (source, st, anchor, sx, sy) =>
		st.kind === 'path' && moveWay(source, st as Statement) === 'option'
			? stretchByOption(source, st as Statement, anchor, sx, sy)
			: moveWay(source, st as Statement) === 'loop'
				? stretchLoop(source, st as Statement, anchor, sx, sy)
				: stretchPoints(source, pathPoints(source, st as Statement), radii(source, st as Statement), anchor, sx, sy, [
						...arcStretchEdits(source, st as Statement, sx, sy),
						...mirroredBendEdits(source, st as Statement, sx, sy)
					]),
	shiftStatement: (source, st, du, dv, page) => shiftStatement(source, st as Statement, du, dv, page),
	readRotation: (source, st) => readRotation(source, st as Statement),
	rotateStatement: (source, st, center, degrees) => rotateStatement(source, st as Statement, center, degrees),
	duplicateStatement: (source, st, du, dv, page) => (inDiagram(st) ? source : duplicateStatement(source, st as Statement, du, dv, page)),
	removeStatement: (source, st) => (inDiagram(st) ? removeDiagramStatement : removeStatement)(source, st as Statement),
	nameOf: (source, st) => (st.kind === 'node' ? nodeName(source, st as Statement) : null),
	readConnector: (source, st) => readConnector(source, st as Statement),
	readAxis: (source, st) => readAxis(source, st as Statement),
	writeAxis: (source, st, change) => writeAxis(source, st as Statement, change),
	readPlot: (source, st) => readPlot(source, st as Statement),
	writePlot: (source, st, change) => writePlot(source, st as Statement, change),
	addPlot: (source, axis, kind) => addPlot(source, axis as Statement, kind),
	libraryElements: LIBRARY_ELEMENTS,
	addElement(source, pictureIndex, element) {
		const added = appendPastedStatements(source, pictureIndex, element.text);
		return added === null ? null : withNeeds(added, element);
	},
	circuitParts: CIRCUIT_PARTS,
	readCircuit: (source, st) => readCircuit(source, st as Statement),
	writeCircuit: (source, st, k, change) => writeCircuit(source, st as Statement, k, change),
	readNodeBox: (source, st) => readNodeBox(source, st as Statement),
	nodeShapes: ['rectangle', 'rounded', 'terminal', 'circle', 'ellipse', 'diamond', 'slant', 'cylinder'],
	readNodeLines: (source, st) => readNodeLines(source, st as Statement),
	writeNodeLines: (source, st, lines) => writeNodeLines(source, st as Statement, lines),
	readText(source, st) {
		const span = describeStatement(source, st as Statement).text;
		return span ? typedText(source.slice(span.from, span.to)) : null;
	},
	writeText(source, st, text) {
		const span = describeStatement(source, st as Statement).text;
		if (!span) return null;
		if (st.kind === 'node') return source.slice(0, span.from) + texText(text) + source.slice(span.to);
		if (st.kind !== 'cell' && st.kind !== 'branch') return null;
		// a cell that starts with a bracket is read as the cell's options
		const written =
			st.kind === 'branch' ? branchText(text) : bracedIf(cellText(text, gridAround(source, span.from)?.grid.separator ?? '&'), /^\s*\[/);
		return source.slice(0, span.from) + written + source.slice(span.to);
	},
	readPlacement: (source, st) => readPlacement(source, st as Statement),
	writePlacement: (source, st, to) => writePlacement(source, st as Statement, to),
	addStep,
	namedPoints: (source, picture, st) => namedPoints(source, picture as Picture, st as Statement),
	writeNodeBox: (source, st, change) => writeNodeBox(source, st as Statement, change),
	attachEnd: attachConnectorEnd,
	writeConnector: (source, st, change) => writeConnector(source, st as Statement, change),
	// a diagram's order is its grid's, and a comment after a cell would hide the rest of its row
	letGoOf: (source, pictureIndex, gone, pointOf, placeOf) => letGoOf(source, pictureIndex, gone, pointOf, placeOf),
	brokenNeed(before, after, pictureIndex) {
		const broken = brokenNeed(before, after, pictureIndex);
		return broken && brokenNeedText(broken, describeStatement(after, broken.use).title.toLowerCase());
	},
	moveStatements: (source, picture, ids, to) => (isDiagram(picture) ? null : moveStatements(source, picture as Picture, ids, to)),
	groupStatements: (source, picture, ids) => (isDiagram(picture) ? null : groupStatements(source, picture as Picture, ids)),
	ungroupStatement: (source, picture, id) => (isDiagram(picture) ? null : ungroupStatement(source, picture as Picture, id)),
	readLabel: (source, st) => (inDiagram(st) ? null : readLabel(source, st as Statement)),
	writeLabel: (source, st, label) => (inDiagram(st) ? source : writeLabel(source, st as Statement, label)),
	...tikzDiagrams,
	...tikzTrees,
	appendStatements: appendPastedStatements,
	addDimension,
	upToDate: upgradeDimensions,
	readDimension: (source, picture, st) => readDimension(source, picture as Picture, st as Statement),
	relabelDimension,
	trimmable: (source, st) => trimmable(source, st as Statement),
	writeTrimmed: (source, st, left) => writeTrimmed(source, st as Statement, left),
	addShape(source, pictureIndex, shape) {
		if (isDiagram(readPicture(source, pictureIndex))) {
			function ref(e: Endpoint) {
				return 'ref' in e ? e.ref : 0;
			}
			return shape.tool === 'arrow' ? diagramArrow(source, pictureIndex, ref(shape.from), ref(shape.to)) : null;
		}
		return appendShape(source, pictureIndex, shape);
	},

	readFrame: (source, picture) => readFrame(source, picture as Picture),
	writeFrame: (source, picture, rect) => writeFrame(source, picture as Picture, rect),

	readStyle(source, st) {
		const target = targetOf((st as Statement).command);
		const options = target ? readCommandOptions(source, st as Statement) : null;
		return options && target ? readStyle(options.items, target) : null;
	},
	writeStyle(source, st, change: Partial<ShapeStyle>) {
		const target = targetOf((st as Statement).command);
		const options = target ? readCommandOptions(source, st as Statement) : null;
		if (!options || !target) return null;
		let items = options.items;
		if ('stroke' in change) items = withStroke(items, target, change.stroke ?? null);
		if ('fill' in change) items = withFill(items, target, change.fill ?? null);
		if (change.width) items = withWidth(items, change.width);
		if (change.dash) items = withDash(items, change.dash);
		if (change.arrows !== undefined && change.arrows !== null) items = withArrows(items, change.arrows);
		if (change.opacity) items = withOpacity(items, change.opacity);
		if (change.corners) items = withCorners(items, change.corners);
		if (target === 'node' && 'textColor' in change) items = withTextColor(items, change.textColor ?? null);
		if (target === 'node' && change.textSize) items = withTextSize(items, change.textSize);
		return writeCommandOptions(source, options, items);
	},
	styleChoices: {
		colors: TIKZ_COLORS,
		widths: WIDTHS,
		dashes: DASHES,
		arrows: ARROWS.map((a) => ({ value: a, label: ARROW_LABELS[a] })),
		textSizes: TEXT_SIZES,
		opacities: OPACITIES
	}
};
