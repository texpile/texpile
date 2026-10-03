// Which agents the Agent tab's menu offers: the ones ticked in Preferences, and until anything is ticked there, the
// ones installed. Nothing ticked turns the tab off
import { settings } from '$lib/settings';
import { PANEL_PRESETS } from './agentNames';
import { installedAgents } from './installedAgents.svelte';
import type { PanelAgent } from './agentPanel.types';

const ORDER: PanelAgent[] = [...PANEL_PRESETS, 'custom'];

export function panelAgentsTicked(): PanelAgent[] {
	const { agentPanelAgents, agentPanelCommand } = settings.current;
	if (agentPanelAgents) return agentPanelAgents;
	const found = installedAgents.found;
	return ORDER.filter((a) => (a === 'custom' ? !!agentPanelCommand.trim() : !!found?.[a]));
}

/** the tab hidden: everything unticked */
export function panelTabOff(): boolean {
	return settings.current.agentPanelAgents?.length === 0;
}

/** the ticked list with one agent ticked or not, in the order Preferences lists them */
export function withPanelAgent(agent: PanelAgent, on: boolean): PanelAgent[] {
	const now = new Set(panelAgentsTicked());
	if (on) now.add(agent);
	else now.delete(agent);
	return ORDER.filter((a) => now.has(a));
}
