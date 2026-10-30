import { borderToward } from '../connectors/connectorGeometry';
import type { FigureStatement } from '../figure/figureLanguage';
import type { FigureEditorState } from '../state/editorState.svelte';
import type { StatementBox } from '../state/snapTargets.types';

function middle(b: StatementBox): [number, number] {
	return [(b.x1 + b.x2) / 2, (b.y1 + b.y2) / 2];
}

/** a diagram arrow's handles, where it leaves its cell and meets the other: `e0` and `e1`, as a connector's ends */
export function arrowEnds(ed: FigureEditorState, st: FigureStatement) {
	const cells = ed.picture && ed.drawingMatchesText && ed.preview === null ? ed.language.arrowCells(ed.picture, st) : null;
	const [a, b] = (cells ?? []).map((i) => ed.snapBoxes.find((box) => box.stmt === i));
	if (!a || !b) return [];
	return [
		{ key: 'e0', at: borderToward(a, middle(b)) },
		{ key: 'e1', at: borderToward(b, middle(a)) }
	];
}
