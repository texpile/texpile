import type { ChipFace } from '$lib/editor/visual/extensions/drawnChips/chipFace';

const SILENT = new Set([';', '$$']);

export function silentFace(source: string): ChipFace | null {
	return SILENT.has(source.trim()) ? { dom: document.createElement('span'), character: true } : null;
}
