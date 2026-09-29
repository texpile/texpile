// Two saved copies of one file side by side, read-only: the Timeline's Compare with Previous, VS
// Code's answer to "what changed in this save" for a Local History entry, and its git timeline's
// own click for a version (the version before it against this one). A module, like
// versionChanges.svelte.ts: the Timeline is in the explorer, the window is drawn by the workspace.

export type TwoVersions = {
	title: string;
	subtitle: string;
	/** the file, for its name and highlighting */
	path: string;
	/** null reads as a file that was not there */
	before: () => Promise<string | null>;
	after: () => Promise<string | null>;
};

let shown = $state<TwoVersions | null>(null);

export const twoVersions = {
	get current() {
		return shown;
	}
};

export function showTwoVersions(v: TwoVersions): void {
	shown = v;
}

export function closeTwoVersions(): void {
	shown = null;
}
