import type { StatementInfo } from '$lib/draw/editor/figure/figureLanguage';
import { arrowName } from './source/cd/cdEdits';
import { readCircuit } from './source/circuits/circuitOptions';
import { circuitPart } from './source/circuits/circuitParts';
import { branchAt } from './source/forest/forestEdits';
import { statementMovable } from './source/moves/statementMoves';
import { nodeTextSpan } from './source/nodes';
import { styleFields } from './source/options/styleFields';
import { targetOf } from './source/options/styleOptions';
import type { Statement } from './source/picture';

/** a circuit statement by its part, or Circuit for several */
function circuitTitle(source: string, st: Statement) {
	const parts = readCircuit(source, st);
	if (parts.length > 1) return 'Circuit';
	return parts.length ? (circuitPart(parts[0].type)?.name ?? parts[0].type) : null;
}

function titleOf(text: string, st: Statement) {
	if (st.kind === 'node' && /^\\node\s*(\([^)]*\)\s*)?\[[^\]]*\bstate\b/.test(text)) return 'State';
	if (st.kind === 'node' && /^\\node\s*(\([^)]*\)\s*)?\[[^\]]*\bdraw\b/.test(text)) return 'Box';
	// one that draws nothing holds a place and a name, as a trim leaves a node others measure
	if (st.kind === 'node') return /\{\s*\}\s*;?\s*$/.test(text) ? 'Coordinate' : 'Text';
	if (st.kind === 'scope') return st.command ? 'Layer' : 'Scope';
	if (st.kind === 'axis') return 'Axis';
	if (st.kind === 'plot') return /\bcoordinates\s*\{/.test(text) ? 'Points' : 'Plot';
	if (st.kind === 'foreach') return 'Loop';
	if (st.kind === 'cell') return 'Cell';
	if (st.kind === 'arrow') return 'Arrow';
	if (st.kind === 'branch') return 'Branch';
	if (st.kind !== 'path') return st.command || 'Statement';
	if (st.command === '\\coordinate') return 'Coordinate';
	if (/^\\draw\s*\[\s*dimension\b/.test(text)) return 'Dimension';
	if (/\brectangle\b/.test(text)) return 'Rectangle';
	if (/\bcircle\b/.test(text)) return 'Circle';
	if (/\bellipse\b/.test(text)) return 'Ellipse';
	if (/\barc\s*[[(]/.test(text)) return 'Arc';
	if (/\bplot\b/.test(text)) return 'Freehand';
	if (/\bcontrols\b/.test(text)) return 'Curve';
	if (/\bgrid\b/.test(text)) return 'Grid';
	if (/--\s*cycle\b/.test(text)) return 'Polygon';
	return /\[[^\]]*-[^\]]*\]/.test(text) && /--|-\||\|-|to\b/.test(text) ? 'Arrow' : 'Line';
}

function textSpan(source: string, st: Statement) {
	if (st.kind === 'node') return nodeTextSpan(st);
	if (st.kind === 'cell') return { from: st.from, to: st.to };
	return st.kind === 'branch' ? (branchAt(source, st.from)?.content ?? null) : null;
}

export function describeStatement(source: string, st: Statement): StatementInfo {
	const text = source.slice(st.from, st.to);
	const editable = st.kind === 'path' || st.kind === 'node';
	const title = circuitTitle(source, st) ?? titleOf(text, st);
	return {
		title,
		movable: statementMovable(source, st),
		target: editable ? targetOf(st.command) : null,
		fields: styleFields(source, st),
		text: textSpan(source, st),
		name: st.kind === 'arrow' ? arrowName(source, st.from) : null
	};
}
