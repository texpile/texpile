// Opened on one file rather than a folder. Not persisted: layout is one global blob, so it
// would follow the user into the next folder they open.

import { box } from '$lib/runes/box.svelte';
import type { WorkspaceCapabilities, WorkspaceProvider } from './workspaceProvider';

export const fileMode = box(false);

/** what a lone file can do, the way sessionProvider says it for a guest: edit the file, and nothing that reads or
 *  writes the folder around it. Open in Workspace is the way to the rest */
export const SINGLE_FILE_CAPS: WorkspaceCapabilities = {
	manageTree: false,
	compile: false,
	git: false,
	format: false,
	search: false,
	terminal: false,
	share: false,
	comments: false,
	agent: false,
	project: false
};

/** what this window can do now: the workspace classes hold the provider they were built with, and a window can turn to a
 *  lone file (Open With) while they live */
export function capsOf(provider: WorkspaceProvider): WorkspaceCapabilities {
	return fileMode.current ? SINGLE_FILE_CAPS : provider.caps;
}
