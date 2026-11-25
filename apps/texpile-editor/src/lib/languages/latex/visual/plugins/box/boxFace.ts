import { appendTo, chipElement, faceOfParts, elementMode, type ChipFace } from '$lib/languages/latex/visual/core';
import './box.css';

export const TEXT_BOXES = new Set(['parbox', 'rotatebox', 'scalebox', 'resizebox']);

export function boxFace(parts: ChipFace[], angle: string | null): ChipFace | null {
	if (parts.some((part) => part.line)) return null;
	const face = faceOfParts(parts, false);
	const turn = angle === null ? 0 : ((Number(angle.trim()) % 360) + 360) % 360;
	if (Number.isNaN(turn) || turn === 0) return face;
	if (turn !== 90 && turn !== 270) return null;
	const mode = elementMode(chipElement);
	const dom = mode.make('span', 'drawn-rotated');
	dom.dataset.turn = turn === 90 ? 'ccw' : 'cw';
	return { ...face, dom: appendTo(dom, mode.ofFace(face)) };
}
