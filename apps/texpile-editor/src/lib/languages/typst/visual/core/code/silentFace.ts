import type { ChipFace } from '$lib/editor/visual/extensions/drawnChips/chipFace';
import { typstElement } from '../looks/typstLooks';

const SILENT = new Set([';', '$$']);

export function silentFace(source: string): ChipFace | null {
	return SILENT.has(source.trim()) ? { dom: typstElement('span'), character: true } : null;
}
