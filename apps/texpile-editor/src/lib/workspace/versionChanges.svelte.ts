// Which version's own changes are on screen (VersionChangesModal), opened from a History row's
// menu. A module rather than props: the row is four components below the workspace that draws it.
import type { GitLogEntry } from './scm/git';

let shown = $state<GitLogEntry | null>(null);

export const versionChanges = {
	get entry() {
		return shown;
	}
};

export function showVersionChanges(entry: GitLogEntry): void {
	shown = entry;
}

export function closeVersionChanges(): void {
	shown = null;
}
