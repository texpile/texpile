import type { Component } from 'svelte';
import MathSettings from '$lib/editor/visual/extensions/mathlivebridge/settings/MathSettings.svelte';
import { settingsPanelOffer, type PanelProps } from '$lib/editor/visual/extensions/blockHandle/settingsPanelOffer.svelte';
import { m } from '$lib/paraglide/messages';

/** a display's settings from the handle's gear or the math menu, as the field's own gear opened them */
export const MATH_SETTINGS = settingsPanelOffer({
	nodeType: 'block_math',
	label: () => m.mathsettings_settings_button_label(),
	component: MathSettings as unknown as Component<PanelProps>,
	opener: 'open'
});
