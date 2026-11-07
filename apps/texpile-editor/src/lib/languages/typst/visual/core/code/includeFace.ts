// `include "chapter.typ"` standing in a code body, drawn as the name of the file it brings in
import type { ChipFace } from '$lib/editor/visual/extensions/drawnChips/chipFace';
import { faceOf } from '../parts/wordsFace';
import { readInclude } from './includeCall';

export function includeFace(source: string): ChipFace | null {
	const written = source.trim();
	const file = readInclude(written);
	return file ? faceOf(file, 'drawn-typst-quiet', written) : null;
}
