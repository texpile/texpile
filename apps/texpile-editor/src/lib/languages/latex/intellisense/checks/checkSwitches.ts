// which LaTeX checks run: the folder's choice over the app's, a check with neither is on
import { settings, updateSettings } from '$lib/settings';
import { projectChecks, projectConfigSync } from '$lib/workspace/projectConfigSync.svelte';
import { workspaceRoot } from '$lib/workspace/workspaceStore';

export const LATEX_CHECK_IDS = ['undefined-command', 'engine', 'unknown-option', 'package-clash'] as const;
export type LatexCheckId = (typeof LATEX_CHECK_IDS)[number];

export function isLatexCheckId(id: string): id is LatexCheckId {
	return (LATEX_CHECK_IDS as readonly string[]).includes(id);
}

/** the app's choice alone */
export function appCheckIsOn(id: string): boolean {
	return settings.current.latexChecks?.[id] ?? true;
}

export function checkIsOn(id: string): boolean {
	return projectChecks.current[id] ?? appCheckIsOn(id);
}

/** turns one check on or off everywhere; undefined gives it back its default */
export function setLatexCheck(id: string, on: boolean | undefined): void {
	const { [id]: _, ...others } = settings.current.latexChecks ?? {};
	updateSettings({ latexChecks: on === undefined ? others : { ...others, [id]: on } });
}

/** turns one check on or off for the open folder; undefined makes it follow the app's setting again */
export function setFolderCheck(id: string, on: boolean | undefined): void {
	const { [id]: _, ...others } = projectChecks.current;
	projectConfigSync.setChecks(workspaceRoot.current, on === undefined ? others : { ...others, [id]: on });
}

/** changes whenever a check is switched on or off */
export function checkSwitchKey(): string {
	return LATEX_CHECK_IDS.map((id) => (checkIsOn(id) ? '1' : '0')).join('');
}
