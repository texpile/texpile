// The icon and word for each kind of step an agent reports
import { Brain, FileText, Globe, MoveRight, Pencil, Search, SquareTerminal, Trash2, Wrench } from '@lucide/svelte';
import { m } from '$lib/paraglide/messages';
import type { ToolKind } from '../../agentPanel.types';

export function stepIcon(kind: ToolKind): typeof FileText {
	switch (kind) {
		case 'read':
			return FileText;
		case 'edit':
			return Pencil;
		case 'delete':
			return Trash2;
		case 'move':
			return MoveRight;
		case 'search':
			return Search;
		case 'execute':
			return SquareTerminal;
		case 'think':
			return Brain;
		case 'fetch':
			return Globe;
		default:
			return Wrench;
	}
}

/** the verb before a file's name, for the kinds that act on one */
export function stepKindLabel(kind: ToolKind): string {
	if (kind === 'delete') return m.agent_panel_step_delete();
	if (kind === 'move') return m.agent_panel_step_move();
	return m.agent_panel_step_edit();
}
