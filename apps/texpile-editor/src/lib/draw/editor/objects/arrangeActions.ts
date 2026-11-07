import { withKeyLabel } from '$lib/keybindings/keybindings.svelte';
import { m } from '$lib/paraglide/messages';
import { ArrowDown, ArrowDownToLine, ArrowUp, ArrowUpToLine, Group, Ungroup } from '@lucide/svelte';
import type { Component } from 'svelte';
import { inSentence } from '../figure/inSentence';
import type { FigureEditorState } from '../state/editorState.svelte';
import { canGroup, canOrder, groupSelection, orderSelection, ungroupBlocker, ungroupSelection, type OrderMove } from './arrangeCommands';

export type ArrangeAction = {
	key: string;
	icon: Component;
	label: string;
	hint: string;
	disabled: boolean;
	run: () => void;
};

// the list runs in written order, back to front, so up is back
const ORDER: { move: OrderMove; label: () => string; command: string; icon: typeof ArrowUp }[] = [
	{ move: 'back', label: () => m.figure_cmd_back(), command: 'figure.sendToBack', icon: ArrowUpToLine },
	{ move: 'backward', label: () => m.figure_cmd_backward(), command: 'figure.sendBackward', icon: ArrowUp },
	{ move: 'forward', label: () => m.figure_cmd_forward(), command: 'figure.bringForward', icon: ArrowDown },
	{ move: 'front', label: () => m.figure_cmd_front(), command: 'figure.bringToFront', icon: ArrowDownToLine }
];

/** the objects list's actions, in the order they give way to the "..." (last first) */
export function arrangeActions(editor: FigureEditorState): ArrangeAction[] {
	const blocker = ungroupBlocker(editor);
	return [
		{
			key: 'group',
			icon: Group,
			label: m.figure_cmd_group(),
			hint: withKeyLabel((keys) => m.figure_arrange_group_tip({ keys }), 'figure.group'),
			disabled: !canGroup(editor),
			run: () => groupSelection(editor)
		},
		{
			key: 'ungroup',
			icon: Ungroup,
			label: m.figure_cmd_ungroup(),
			hint: blocker
				? `${m.figure_cmd_ungroup()}: ${inSentence(blocker)}`
				: withKeyLabel((keys) => `${m.figure_cmd_ungroup()} (${keys})`, 'figure.ungroup'),
			disabled: blocker !== null,
			run: () => ungroupSelection(editor)
		},
		...ORDER.map((o) => ({
			key: o.move,
			icon: o.icon,
			label: o.label(),
			hint: withKeyLabel((keys) => `${o.label()} (${keys})`, o.command),
			disabled: !canOrder(editor, o.move),
			run: () => orderSelection(editor, o.move)
		}))
	];
}
