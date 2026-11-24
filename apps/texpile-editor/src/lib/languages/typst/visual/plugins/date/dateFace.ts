// `#datetime.today().display("[month repr:long] [year]")` drawn as the date Typst prints, as the title block prints one
import { faceElement } from '$lib/editor/canvas';
import { tippedFace, type ChipFace } from '$lib/languages/typst/visual/core';
import { readDate } from './dateCall';

export function dateFace(source: string): ChipFace | null {
	const written = source.trim();
	const text = readDate(written);
	if (!text) return null;
	return tippedFace(faceElement('span', '', text), written);
}
