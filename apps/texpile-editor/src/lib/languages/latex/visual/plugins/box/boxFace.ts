// the boxes a table cell holds its text in (\parbox, \rotatebox, \resizebox): the text, turned as \rotatebox turns it.
// The package data gives the text of \scalebox and \resizebox no role, so the boxes are named here
import { faceElement, faceOfParts, type ChipFace } from '$lib/languages/latex/visual/core';
import './box.css';

export const TEXT_BOXES = new Set(['parbox', 'rotatebox', 'scalebox', 'resizebox']);

/** `angle` is \rotatebox's, in degrees */
export function boxFace(parts: ChipFace[], angle: string | null): ChipFace | null {
	if (parts.some((part) => part.line)) return null;
	const face = faceOfParts(parts, false);
	const turn = angle === null ? 0 : ((Number(angle.trim()) % 360) + 360) % 360;
	if (Number.isNaN(turn) || turn === 0) return face;
	if (turn !== 90 && turn !== 270) return null;
	const dom = faceElement('span', 'drawn-rotated');
	dom.dataset.turn = turn === 90 ? 'ccw' : 'cw';
	dom.appendChild(face.dom);
	return { ...face, dom };
}
