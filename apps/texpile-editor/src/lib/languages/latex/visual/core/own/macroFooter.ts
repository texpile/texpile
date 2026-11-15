import type { ChipPanelFooter } from '$lib/editor/visual/extensions/drawnChips/chipPanel.svelte';
import { m } from '$lib/paraglide/messages';
import { ownMacroDefinition } from './ownMacroFace.svelte';
import { macroCallName } from './ownMacroCall';

/** in an empty argument, for a call just typed; else after the call */
export function macroCaret(source: string): number | undefined {
	const empty = source.indexOf('{}');
	if (empty >= 0) return empty + 1;
	return macroFooter(source, () => {}) ? source.length : undefined;
}

/** under a call of the paper's own macro: its definition, and the way to it */
export function macroFooter(source: string, jumpToDefinition: (name: string) => void): ChipPanelFooter | null {
	const name = macroCallName(source);
	const definition = name ? ownMacroDefinition(name) : null;
	if (!name || !definition) return null;
	return { note: definition.def, action: m.drawn_chip_macro_go_to(), run: () => jumpToDefinition(name) };
}
