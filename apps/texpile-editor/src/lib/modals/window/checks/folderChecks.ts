// the open folder's choice for each LaTeX check: follow the app setting, on or off
import { m } from '$lib/paraglide/messages';
import { GUEST_ROOT } from '$lib/collab/sessionProvider';
import { setFolderCheck } from '$lib/languages/latex/intellisense/checks/checkSwitches';
import { projectChecks } from '$lib/workspace/projectConfigSync.svelte';
import { workspaceRoot } from '$lib/workspace/workspaceStore';

export type FolderCheckChoice = 'follow' | 'on' | 'off';

export function folderCheckChoice(id: string): FolderCheckChoice {
	const on = projectChecks.current[id];
	return on === undefined ? 'follow' : on ? 'on' : 'off';
}

export function folderCheckOptions(): { value: FolderCheckChoice; label: string }[] {
	return [
		{ value: 'follow', label: m.prefs_checks_follow() },
		{ value: 'on', label: m.prefs_checks_on() },
		{ value: 'off', label: m.prefs_checks_off() }
	];
}

/** why the choices are grayed out, empty when they are not */
export function folderChecksUnavailable(): string {
	return workspaceRoot.current === GUEST_ROOT ? m.unavailable_guest() : '';
}

export function chooseFolderCheck(id: string, choice: string): void {
	if (folderChecksUnavailable()) return;
	setFolderCheck(id, choice === 'follow' ? undefined : choice === 'on');
}
