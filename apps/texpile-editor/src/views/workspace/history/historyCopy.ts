import { versionSchemeOf } from '$lib/files/identity/versionUris';
import type { CompareRef } from '$lib/workspace/tabs.svelte';

/** the file and copy Version History shows: the tab's own file, set with its comparison, not loadedPath, which follows a
 *  beat later; with that the copy was looked for among the last file's copies, taken as deleted, and the tab left */
export function historyCopyOf(compare: CompareRef | null, tabPath: string | null): { path: string; hash: string } | null {
	return compare && versionSchemeOf(compare) === 'history' && tabPath ? { path: tabPath, hash: compare.hash } : null;
}
