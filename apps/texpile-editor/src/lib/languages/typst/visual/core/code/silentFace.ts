// source that Typst prints nothing for: the semicolon that ends a code expression among the words (`#strong[yes];, it is`)
// and an equation with nothing in it
import type { ChipFace } from '$lib/editor/visual/extensions/drawnChips/chipFace';

const SILENT = new Set([';', '$$']);

export function silentFace(source: string): ChipFace | null {
	return SILENT.has(source.trim()) ? { dom: document.createElement('span'), character: true } : null;
}
