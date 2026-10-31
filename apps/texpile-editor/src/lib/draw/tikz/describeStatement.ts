import type { StatementInfo } from '$lib/draw/editor/figure/figureLanguage';
import { kindTitle } from '$lib/draw/editor/figure/statementKinds';
import { arrowName } from './source/cd/cdEdits';
import { readCircuit } from './source/circuits/circuitOptions';
import { circuitPart } from './source/circuits/circuitParts';
import { branchAt } from './source/forest/forestEdits';
import { statementMovable } from './source/moves/statementMoves';
import { nodeTextSpan } from './source/nodes';
import { styleFields } from './source/options/styleFields';
import { targetOf } from './source/options/styleOptions';
import type { Statement } from './source/picture';

/** a circuit statement by its part, or circuit for several */
function circuitKind(source: string, st: Statement) {
	const parts = readCircuit(source, st);
	if (parts.length > 1) return 'circuit';
	return parts.length ? (circuitPart(parts[0].type) ? `part:${parts[0].type}` : parts[0].type) : null;
}

function kindOf(text: string, st: Statement) {
	if (st.kind === 'node' && /^\\node\s*(\([^)]*\)\s*)?\[[^\]]*\bstate\b/.test(text)) return 'state';
	if (st.kind === 'node' && /^\\node\s*(\([^)]*\)\s*)?\[[^\]]*\bdraw\b/.test(text)) return 'box';
	// one that draws nothing holds a place and a name, as a trim leaves a node others measure
	if (st.kind === 'node') return /\{\s*\}\s*;?\s*$/.test(text) ? 'coordinate' : 'text';
	if (st.kind === 'scope') return st.command ? 'layer' : 'scope';
	if (st.kind === 'axis') return 'axis';
	if (st.kind === 'plot') return /\bcoordinates\s*\{/.test(text) ? 'points' : 'plot';
	if (st.kind === 'foreach') return 'loop';
	if (st.kind === 'cell') return 'cell';
	if (st.kind === 'arrow') return 'arrow';
	if (st.kind === 'branch') return 'branch';
	if (st.kind !== 'path') return st.command || 'statement';
	if (st.command === '\\coordinate') return 'coordinate';
	if (/^\\draw\s*\[\s*dimension\b/.test(text)) return 'dimension';
	if (/\brectangle\b/.test(text)) return 'rectangle';
	if (/\bcircle\b/.test(text)) return 'circle';
	if (/\bellipse\b/.test(text)) return 'ellipse';
	if (/\barc\s*[[(]/.test(text)) return 'arc';
	if (/\bplot\b/.test(text)) return 'freehand';
	if (/\bcontrols\b/.test(text)) return 'curve';
	if (/\bgrid\b/.test(text)) return 'grid';
	if (/--\s*cycle\b/.test(text)) return 'polygon';
	return /\[[^\]]*-[^\]]*\]/.test(text) && /--|-\||\|-|to\b/.test(text) ? 'arrow' : 'line';
}

function textSpan(source: string, st: Statement) {
	if (st.kind === 'node') return nodeTextSpan(st);
	if (st.kind === 'cell') return { from: st.from, to: st.to };
	return st.kind === 'branch' ? (branchAt(source, st.from)?.content ?? null) : null;
}

export function describeStatement(source: string, st: Statement): StatementInfo {
	const text = source.slice(st.from, st.to);
	const editable = st.kind === 'path' || st.kind === 'node';
	const kind = circuitKind(source, st) ?? kindOf(text, st);
	return {
		kind,
		title: kindTitle(kind),
		movable: statementMovable(source, st),
		target: editable ? targetOf(st.command) : null,
		fields: styleFields(source, st),
		text: textSpan(source, st),
		name: st.kind === 'arrow' ? arrowName(source, st.from) : null
	};
}
