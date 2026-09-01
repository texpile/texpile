// Opened on one file rather than a folder. Not persisted: layout is one global blob, so it
// would follow the user into the next folder they open.

import { box } from '$lib/runes/box.svelte';
import type { WorkspaceCapabilities } from './workspaceProvider';

export const fileMode = box(false);

/** what a lone file can do, the way sessionProvider says it for a guest */
export const NO_PROJECT_CAPS: WorkspaceCapabilities = {
	manageTree: false,
	compile: false,
	git: false,
	format: false,
	search: false,
	terminal: false
};
