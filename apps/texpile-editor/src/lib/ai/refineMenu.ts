// The Refine actions as a submenu of both right-click menus, one for each agent Refine offers
import { Pencil, Sparkles } from '@lucide/svelte';
import type { ContextMenuItem } from '$lib/menus/contextMenu.svelte';
import { m } from '$lib/paraglide/messages';
import { REFINE_ACTIONS } from './refineActions';
import { openRefineCard } from './refineCardState.svelte';
import { agentName, refiner, type RefineAgent, type SelectionRefiner } from './selectionRefiner';
import { refineAgentsOffered } from './refineAgents.svelte';

function actionItems(r: SelectionRefiner, agent: RefineAgent): ContextMenuItem[] {
	return REFINE_ACTIONS.map((action) => ({ label: action.label(), icon: action.icon, onclick: () => void r.refine(action, agent) }));
}

/** the selected text's box, which is where the card goes when no toolbar button asked for it */
function selectionRect(): DOMRect | null {
	const sel = window.getSelection();
	if (!sel || sel.rangeCount === 0 || sel.isCollapsed) return null;
	const box = sel.getRangeAt(0).getBoundingClientRect();
	return box.width || box.height ? box : null;
}

/** none wherever Refine is not set up, so the menu leaves it out */
export function refineMenuItems(hasSelection: boolean): ContextMenuItem[] {
	const r = refiner.current;
	if (!r?.available) return [];
	// measured while the menu is built, because clicking an item takes the selection off the page
	const at = selectionRect();
	return refineAgentsOffered().map((agent) => ({
		label: m.ai_refine_menu({ agent: agentName(agent) }),
		icon: Sparkles,
		disabled: !hasSelection || r.busy,
		submenu: [
			...actionItems(r, agent),
			{ separator: true },
			// the card's instruction box, otherwise reachable only from the selection toolbar, which
			// the reader can turn off for good
			{ label: m.ai_refine_custom(), icon: Pencil, onclick: () => at && openRefineCard(at, agent) }
		]
	}));
}
