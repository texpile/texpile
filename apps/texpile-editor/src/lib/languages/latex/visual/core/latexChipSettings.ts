// the settings a LaTeX chip's panel shows, when the chip is one command they can hold exactly; else the panel is its LaTeX
import type { ChipSettings } from '$lib/editor/visual/extensions/drawnChips/chipPanel.svelte';
import { readComment } from '$lib/editor/visual/extensions/drawnChips/commentLines';
import CommentSettings from '$lib/editor/visual/extensions/drawnChips/CommentSettings.svelte';
import { HEAD } from '$lib/languages/latex/drawnCommands';
import { ownMacroBody } from './own/ownMacroFace.svelte';
import { macroCallName } from './own/ownMacroCall';
import { commandPlugins } from './plugin/pluginMap';

export function latexChipSettings(source: string): ChipSettings | null {
	// the paper's own definition wins, as it does in the drawing: the call is edited as LaTeX, its definition under it
	const call = macroCallName(source);
	if (call && ownMacroBody(call, source) !== null) return null;
	if (readComment(source)?.marker === '%') return CommentSettings;
	const head = HEAD.exec(source);
	const name = head?.[3] ?? head?.[2];
	for (const plugin of name ? commandPlugins(name) : []) {
		const settings = plugin.settings?.(source);
		if (settings) return settings;
	}
	return null;
}
