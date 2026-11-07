// a label standing in the text beside a call, drawn as the label chips of the page are
import type { ChipFace } from '$lib/editor/visual/extensions/drawnChips/chipFace';
import { labelFace } from '$lib/editor/visual/extensions/drawnChips/faces/labelFace';

const LABEL = /^<([\p{L}\d_:.-]+)>$/u;

export function labelChipFace(source: string): ChipFace | null {
	const name = LABEL.exec(source.trim())?.[1];
	return name ? labelFace(name) : null;
}
