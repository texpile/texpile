// one of the agent's own settings as its dropdown shows it: the words on the button, and the menu under it
import { m } from '$lib/paraglide/messages';
import type { DropdownGroup } from '$lib/menus/MenuDropdown.svelte';
import type { ConfigChoice, ConfigOption } from '../../agentPanel.types';

// a mode, a model or a thinking level reads as itself; any other setting, such as an on/off one, needs its name too
const READS_AS_ITSELF = new Set(['mode', 'model', 'thought_level']);

export function configOptionButton(option: ConfigOption): string {
	const value = option.choices.find((c) => c.value === option.currentValue)?.name ?? option.currentValue;
	return option.category && READS_AS_ITSELF.has(option.category) ? value : `${option.name}: ${value}`;
}

/** agents list models newest first, so the first of each family (Opus, Sonnet, ...) is its latest; the rest, and only
 *  for models, go one step away. The chosen one stays in view whatever it is */
function newestOfEachFamily(option: ConfigOption): { shown: ConfigChoice[]; older: ConfigChoice[] } {
	if (option.category !== 'model') return { shown: option.choices, older: [] };
	const seen = new Set<string>();
	const shown: ConfigChoice[] = [];
	const older: ConfigChoice[] = [];
	for (const c of option.choices) {
		const family = c.name.split(' ')[0].toLowerCase();
		if (!seen.has(family) || c.value === option.currentValue) shown.push(c);
		else older.push(c);
		seen.add(family);
	}
	return { shown, older };
}

export function configOptionMenu(option: ConfigOption): DropdownGroup[] {
	function item(c: ConfigChoice) {
		return { value: c.value, label: c.name, note: c.description, checked: c.value === option.currentValue };
	}
	const { shown, older } = newestOfEachFamily(option);
	return [{ label: option.name, options: shown.map(item), more: { label: m.agent_panel_more_models(), options: older.map(item) } }];
}
