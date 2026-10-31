import type { StatementInfo } from '$lib/draw/editor/figure/figureLanguage';
import { kindTitle } from '$lib/draw/editor/figure/statementKinds';
import { statementMovable } from './source/moves/statementMoves';
import { styleFields } from './source/styles/styleFields';
import { contentTextSpan } from './source/nodes/nodeText';
import { namedArg, type CetzStatement } from './source/picture';

function kindOf(source: string, st: CetzStatement) {
	if (st.command === 'finite-state') return 'state';
	if (st.kind === 'node') return st.text || namedArg(source, st, 'frame') ? 'box' : 'text';
	if (st.kind === 'frame') return 'canvas-size';
	if (st.kind === 'foreach') return 'loop';
	if (st.kind === 'scope') return st.command === 'group' ? 'group' : 'scope';
	switch (st.command) {
		case 'line':
			return namedArg(source, st, 'mark') ? 'arrow' : 'line';
		case 'rect':
			return 'rectangle';
		case 'circle':
			return namedArg(source, st, 'radius')?.text.startsWith('(') ? 'ellipse' : 'circle';
		case 'bezier':
		case 'bezier-through':
			return namedArg(source, st, 'mark') ? 'arrow' : 'curve';
		case 'catmull':
		case 'hobby':
			return 'freehand';
		case 'arc':
			return 'arc';
		case 'grid':
			return 'grid';
		case 'texpile-dimension':
			return 'dimension';
		case 'brace':
		case 'flat-brace':
			return 'brace';
		case 'coil':
			return 'spring';
		case 'zigzag':
			return 'zigzag';
		case 'wave':
			return 'wave';
		case 'angle':
		case 'right-angle':
			return 'angle';
	}
	const text = source.slice(st.from, st.to);
	if (/^import\b/.test(text)) return 'import';
	if (/^let\b/.test(text)) return 'definition';
	if (/^(set|show)\b/.test(text)) return 'setting';
	return st.command || 'statement';
}

export function describeStatement(source: string, st: CetzStatement): StatementInfo {
	return {
		kind: kindOf(source, st),
		title: kindTitle(kindOf(source, st)),
		movable: statementMovable(source, st),
		// a shape has a stroke and maybe a fill, either of which can be none; text is edited as text
		target: st.kind === 'path' ? 'path' : st.kind === 'node' ? 'node' : null,
		fields: styleFields(source, st),
		text: st.kind === 'node' ? contentTextSpan(source, st) : null,
		name: null
	};
}
