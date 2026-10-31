import { m } from '$lib/paraglide/messages';
import { ArrowDown, ArrowDownToLine, ArrowUp, ArrowUpToLine, Group, Ungroup } from '@lucide/svelte';
import { inSentence } from '../figure/inSentence';
import type { SidebarAction } from '../sidebar/sidebarActions';
import type { FigureEditorState } from '../state/editorState.svelte';
import { canGroup, canOrder, groupSelection, orderSelection, ungroupBlocker, ungroupSelection, type OrderMove } from './arrangeCommands';

// the list runs in written order, back to front, so up is back
const ORDER: { move: OrderMove; label: () => string; keys: string; icon: typeof ArrowUp }[] = [
	{ move: 'back', label: () => m.figure_cmd_back(), keys: 'Ctrl+Shift+[', icon: ArrowUpToLine },
	{ move: 'backward', label: () => m.figure_cmd_backward(), keys: 'Ctrl+[', icon: ArrowUp },
	{ move: 'forward', label: () => m.figure_cmd_forward(), keys: 'Ctrl+]', icon: ArrowDown },
	{ move: 'front', label: () => m.figure_cmd_front(), keys: 'Ctrl+Shift+]', icon: ArrowDownToLine }
];

/** the objects list's actions, in the order they give way to the "..." (last first) */
export function arrangeActions(editor: FigureEditorState): SidebarAction[] {
	const blocker = ungroupBlocker(editor);
	return [
		{
			key: 'group',
			icon: Group,
			label: m.figure_cmd_group(),
			hint: m.figure_arrange_group_tip({ keys: 'Ctrl+G' }),
			disabled: !canGroup(editor),
			run: () => groupSelection(editor)
		},
		{
			key: 'ungroup',
			icon: Ungroup,
			label: m.figure_cmd_ungroup(),
			hint: blocker ? `${m.figure_cmd_ungroup()}: ${inSentence(blocker)}` : `${m.figure_cmd_ungroup()} (Ctrl+Shift+G)`,
			disabled: blocker !== null,
			run: () => ungroupSelection(editor)
		},
		...ORDER.map((o) => ({
			key: o.move,
			icon: o.icon,
			label: o.label(),
			hint: `${o.label()} (${o.keys})`,
			disabled: !canOrder(editor, o.move),
			run: () => orderSelection(editor, o.move)
		}))
	];
}
