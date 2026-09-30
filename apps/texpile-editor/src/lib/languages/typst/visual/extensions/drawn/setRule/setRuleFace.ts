// a set rule drawn as one quiet line saying what it sets, its Typst in the hint
import { tip } from '$lib/components/tooltip.svelte';
import type { ChipFace } from '$lib/editor/visual/extensions/drawnChips/chipFace';
import type { SetRule } from './setRuleCall';
import { setRuleSummary } from './setRuleSummary';

export function setRuleFace(rule: SetRule, source: string): ChipFace {
	const [target, ...parts] = setRuleSummary(rule);
	const dom = document.createElement('span');
	dom.className = 'drawn-setting';
	const name = dom.appendChild(document.createElement('span'));
	name.className = 'drawn-setting-target';
	name.textContent = target;
	for (const part of parts) dom.appendChild(document.createTextNode(` · ${part}`));
	const tipped = tip(dom, source);
	return { dom, line: true, destroy: () => tipped.destroy() };
}
