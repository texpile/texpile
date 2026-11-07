// the settings a Typst chip's panel shows, when the chip is one call they can hold exactly; else the panel is its Typst
import type { ChipSettings } from '$lib/editor/visual/extensions/drawnChips/chipPanel.svelte';
import { readComment } from '$lib/editor/visual/extensions/drawnChips/commentLines';
import CommentSettings from '$lib/editor/visual/extensions/drawnChips/CommentSettings.svelte';
import { useNameOf } from './chipUse';
import { listedPlugins } from './pluginMap';

export function typstChipSettings(source: string): ChipSettings | null {
	if (readComment(source)?.marker === '//') return CommentSettings;
	const named = useNameOf(source);
	for (const plugin of named ? listedPlugins(named) : []) {
		const settings = plugin.settings?.(source);
		if (settings) return settings;
	}
	return null;
}
