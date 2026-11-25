import type { Component } from 'svelte';
import CodeBlockSettings from '$lib/editor/visual/extensions/codemirrorbridge/CodeBlockSettings.svelte';
import { settingsPanelOffer, type PanelProps } from '$lib/editor/visual/extensions/blockHandle/settingsPanelOffer.svelte';
import { m } from '$lib/paraglide/messages';

/** a code block's language from the handle's gear, as the card's own gear chose it */
export const CODE_SETTINGS = settingsPanelOffer({
	nodeType: 'code_block',
	label: () => m.codeblock_settings_button_label(),
	component: CodeBlockSettings as unknown as Component<PanelProps>,
	opener: 'open'
});
