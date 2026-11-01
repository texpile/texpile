import { versionSchemeOf } from '$lib/files/identity/versionUris';
import type { CompareRef } from '$lib/workspace/tabs.svelte';

/** the tab's own file and copy, not loadedPath, which follows a beat later and made the copy look deleted */
export function historyCopyOf(compare: CompareRef | null, tabPath: string | null): { path: string; hash: string } | null {
	return compare && versionSchemeOf(compare) === 'history' && tabPath ? { path: tabPath, hash: compare.hash } : null;
}
