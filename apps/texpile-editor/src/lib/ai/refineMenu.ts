// The Refine actions as a submenu of both right-click menus, under the agent Refine runs; without one, the entry that
// opens Preferences to pick it
import { Pencil, Sparkles } from '@lucide/svelte';
import type { ContextMenuItem } from '$lib/menus/contextMenu.svelte';
import { m } from '$lib/paraglide/messages';
import { REFINE_ACTIONS } from './refineActions';
import { openRefineCard } from './refineCardState.svelte';
import { refiner, type SelectionRefiner } from './selectionRefiner';
import { agentName, agentOffered } from './agent/aiAgent.svelte';
import type { AiAgent } from './agent/aiAgents';
import { openPreferencesAt } from '$lib/stores/dialogStore';

function actionItems(r: SelectionRefiner, agent: AiAgent): ContextMenuItem[] {
	return REFINE_ACTIONS.map((action) => ({ label: action.label(), icon: action.icon, onclick: () => void r.refine(action, agent) }));
}

/** the source editor's selected text: its box is where the card goes when no toolbar button asked for it */
export function domSelectionRect(): DOMRect | null {
	const sel = window.getSelection();
	if (!sel || sel.rangeCount === 0 || sel.isCollapsed) return null;
	const box = sel.getRangeAt(0).getBoundingClientRect();
	return box.width || box.height ? box : null;
}

/** none wherever Refine cannot run at all, so the menu leaves it out; `selectionRect` is the selected text's box */
export function refineMenuItems(hasSelection: boolean, selectionRect: () => DOMRect | null): ContextMenuItem[] {
	const r = refiner.current;
	if (r?.needsAgent) return [{ label: m.ai_refine_setup(), icon: Sparkles, onclick: () => openPreferencesAt('ai') }];
	const agent = agentOffered();
	if (!r?.available || !agent) return [];
	// measured while the menu is built, because clicking an item takes the selection off the page
	const at = selectionRect();
	return [
		{
			label: m.ai_refine_menu({ agent: agentName(agent) }),
			icon: Sparkles,
			disabled: !hasSelection || r.busy,
			submenu: [
				...actionItems(r, agent),
				{ separator: true },
				// the card's instruction box, otherwise reachable only from the selection toolbar, which
				// the reader can turn off for good
				{ label: m.ai_refine_custom(), icon: Pencil, onclick: () => at && openRefineCard(at) }
			]
		}
	];
}
