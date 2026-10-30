import { ArrowDown, ArrowDownToLine, ArrowUp, ArrowUpToLine, Group, Ungroup } from '@lucide/svelte';
import type { SidebarAction } from '../sidebar/sidebarActions';
import type { FigureEditorState } from '../state/editorState.svelte';
import { canGroup, canOrder, groupSelection, orderSelection, ungroupBlocker, ungroupSelection, type OrderMove } from './arrangeCommands';

// the list runs in written order, back to front, so up is back
const ORDER: { move: OrderMove; label: string; keys: string; icon: typeof ArrowUp }[] = [
	{ move: 'back', label: 'Send to back', keys: 'Ctrl+Shift+[', icon: ArrowUpToLine },
	{ move: 'backward', label: 'Send backward', keys: 'Ctrl+[', icon: ArrowUp },
	{ move: 'forward', label: 'Bring forward', keys: 'Ctrl+]', icon: ArrowDown },
	{ move: 'front', label: 'Bring to front', keys: 'Ctrl+Shift+]', icon: ArrowDownToLine }
];

/** the objects list's actions, in the order they give way to the "..." (last first) */
export function arrangeActions(editor: FigureEditorState): SidebarAction[] {
	const blocker = ungroupBlocker(editor);
	return [
		{
			key: 'group',
			icon: Group,
			label: 'Group',
			hint: 'Group in a scope (Ctrl+G)',
			disabled: !canGroup(editor),
			run: () => groupSelection(editor)
		},
		{
			key: 'ungroup',
			icon: Ungroup,
			label: 'Ungroup',
			hint: blocker ? `Ungroup: ${blocker.toLowerCase()}` : 'Ungroup (Ctrl+Shift+G)',
			disabled: blocker !== null,
			run: () => ungroupSelection(editor)
		},
		...ORDER.map((o) => ({
			key: o.move,
			icon: o.icon,
			label: o.label,
			hint: `${o.label} (${o.keys})`,
			disabled: !canOrder(editor, o.move),
			run: () => orderSelection(editor, o.move)
		}))
	];
}
