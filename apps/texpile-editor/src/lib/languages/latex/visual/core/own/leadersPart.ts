// a paper's own command that fills its space with leaders (a table's dotted fill): the box it repeats, drawn a few times.
// \leaders, \cleaders and \xleaders are TeX primitives, which the package data does not describe
import { faceElement, tippedFace, type ChipFace } from '$lib/editor/visual/extensions/drawnChips/chipFace';
import { latexTreeOf } from '$lib/languages/latex/syntax/latexTrees';
import { sourceUnitsIn } from '$lib/languages/latex/parser/tree/walk/sourceUnits';
import { bodyOf } from '$lib/languages/latex/parser/tree/walk/stretch';
import './leaders.css';

const LEADERS = new Set(['leaders', 'cleaders', 'xleaders']);
const SHOWN = 6;

function noSignature(): undefined {
	return undefined;
}

/** `body` is the command's definition */
export function leadersFace(body: string, source: string): ChipFace | null {
	const units = sourceUnitsIn(body, bodyOf(latexTreeOf(body).topNode), noSignature);
	const at = units.findIndex((u) => u.call && LEADERS.has(u.call.name));
	if (at < 0) return null;
	const box = units.slice(at + 1).find((u) => u.piece.kind === 'node' && u.piece.node.name === 'Group');
	if (!box || box.piece.kind !== 'node') return null;
	const text = sourceUnitsIn(body, bodyOf(box.piece.node), noSignature)
		.filter((u) => u.piece.kind === 'word')
		.map((u) => body.slice(u.piece.from, u.piece.to))
		.join('');
	if (!text.trim()) return null;
	const dom = faceElement('span', 'drawn-leaders', Array(SHOWN).fill(text.trim()).join(' '));
	return tippedFace(dom, source);
}
