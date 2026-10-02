// What a file in a turn's "Changed by" list does: show the change in the diff view, or put the file back
// as it was before the turn
import { m } from '$lib/paraglide/messages';
import type { GitBadge } from '$lib/workspace/scm/git';
import { agentHost } from '../agentHost.svelte';
import { readBefore } from './agentBefore';
import type { ChangedFile } from '../agentPanel.types';

export function changeBadge(file: ChangedFile): GitBadge {
	return file.change === 'added' ? 'A' : file.change === 'deleted' ? 'D' : 'M';
}

/** a deleted file has nothing to open; a new one has no earlier text to compare with */
export function openChanges(file: ChangedFile, agent: string): void {
	const host = agentHost.current;
	if (!host || file.change === 'deleted') return;
	if (file.ref) host.openCompareTab(file.path, { hash: file.ref, subject: m.agent_panel_before({ agent }) });
	else host.openFile(file.path);
}

export function canRevert(file: ChangedFile): boolean {
	return file.ref !== null && readBefore(file.ref) !== null;
}

/** writes the text from before the turn; an open file takes it the way it takes any change on disk */
export async function revertChange(file: ChangedFile): Promise<void> {
	const text = file.ref ? readBefore(file.ref) : null;
	if (text === null) return;
	await agentHost.current?.writeText(file.path, text);
}
