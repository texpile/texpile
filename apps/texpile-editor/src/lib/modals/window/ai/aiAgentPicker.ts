// The Agent dropdown's list: the agents found, a custom command, then where to get each one missing
import { SquareTerminal } from '@lucide/svelte';
import type { DropdownGroup, DropdownOption } from '$lib/menus/MenuDropdown.svelte';
import { AGENT_ICON_PATHS } from '$lib/ai/agent/agentIcons';
import { PRESET_AGENTS, agentLabel, agentPlan, type AiAgent, type PresetAgent } from '$lib/ai/agent/aiAgents';
import { m } from '$lib/paraglide/messages';

export const INSTALL_PREFIX = 'install:';

export function agentPickerGroups(found: Record<PresetAgent, boolean> | null, picked: AiAgent | ''): DropdownGroup[] {
	// one picked before it went stays in the list, so the check mark has somewhere to sit
	const listed = PRESET_AGENTS.filter((a) => found?.[a] !== false || a === picked);
	const missing = PRESET_AGENTS.filter((a) => found?.[a] === false);
	const agents: DropdownOption[] = listed.map((a) => ({
		value: a,
		label: agentLabel(a),
		note: found?.[a] === false ? m.prefs_ai_agent_not_found() : agentPlan(a),
		iconPath: AGENT_ICON_PATHS[a],
		checked: a === picked
	}));
	agents.push({
		value: 'custom',
		label: m.prefs_ai_agent_custom_command(),
		note: agentPlan('custom'),
		icon: SquareTerminal,
		checked: picked === 'custom'
	});
	const install = missing.map((a) => ({
		value: INSTALL_PREFIX + a,
		label: m.prefs_ai_agent_install_named({ agent: agentLabel(a) }),
		iconPath: AGENT_ICON_PATHS[a],
		checked: false
	}));
	return install.length ? [{ options: agents }, { options: install }] : [{ options: agents }];
}
