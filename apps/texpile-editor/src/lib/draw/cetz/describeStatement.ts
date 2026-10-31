import type { StatementInfo } from '$lib/draw/editor/figure/figureLanguage';
import { statementMovable } from './source/moves/statementMoves';
import { styleFields } from './source/styles/styleFields';
import { contentTextSpan } from './source/nodes/nodeText';
import { namedArg, type CetzStatement } from './source/picture';

function titleOf(source: string, st: CetzStatement) {
	if (st.command === 'finite-state') return 'State';
	if (st.kind === 'node') return st.text || namedArg(source, st, 'frame') ? 'Box' : 'Text';
	if (st.kind === 'frame') return 'Canvas size';
	if (st.kind === 'foreach') return 'Loop';
	if (st.kind === 'scope') return st.command === 'group' ? 'Group' : 'Scope';
	switch (st.command) {
		case 'line':
			return namedArg(source, st, 'mark') ? 'Arrow' : 'Line';
		case 'rect':
			return 'Rectangle';
		case 'circle':
			return namedArg(source, st, 'radius')?.text.startsWith('(') ? 'Ellipse' : 'Circle';
		case 'bezier':
		case 'bezier-through':
			return namedArg(source, st, 'mark') ? 'Arrow' : 'Curve';
		case 'catmull':
		case 'hobby':
			return 'Freehand';
		case 'arc':
			return 'Arc';
		case 'grid':
			return 'Grid';
		case 'texpile-dimension':
			return 'Dimension';
		case 'brace':
		case 'flat-brace':
			return 'Brace';
		case 'coil':
			return 'Spring';
		case 'zigzag':
			return 'Zigzag';
		case 'wave':
			return 'Wave';
		case 'angle':
		case 'right-angle':
			return 'Angle';
	}
	const text = source.slice(st.from, st.to);
	if (/^import\b/.test(text)) return 'Import';
	if (/^let\b/.test(text)) return 'Definition';
	if (/^(set|show)\b/.test(text)) return 'Setting';
	return st.command || 'Statement';
}

export function describeStatement(source: string, st: CetzStatement): StatementInfo {
	return {
		title: titleOf(source, st),
		movable: statementMovable(source, st),
		// a shape has a stroke and maybe a fill, either of which can be none; text is edited as text
		target: st.kind === 'path' ? 'path' : st.kind === 'node' ? 'node' : null,
		fields: styleFields(source, st),
		text: st.kind === 'node' ? contentTextSpan(source, st) : null,
		name: null
	};
}
