import type { Component } from 'svelte';
import { settingsPanelOffer, type PanelProps } from '$lib/languages/latex/visual/core';
import { m } from '$lib/paraglide/messages';
import FigureGroupSettings from './FigureGroupSettings.svelte';

export const FIGURE_GROUP_SETTINGS = settingsPanelOffer({
	nodeType: 'figure_group',
	label: () => m.figuregroup_settings_title(),
	component: FigureGroupSettings as unknown as Component<PanelProps>,
	opener: 'openAt'
});
