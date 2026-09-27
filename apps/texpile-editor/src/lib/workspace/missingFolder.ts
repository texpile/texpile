// A recents entry can outlive its folder: moved, renamed, deleted, or on a drive that is not
// mounted right now. Opening one used to do nothing (start screen menu) or show an empty
// workspace (File > Open Recent). Say so instead, and let the user drop the entry rather than
// dropping it for them: an unplugged drive makes the path good again once it is back.
import { promptAsk } from '$lib/modals/confirm.svelte';
import { basename } from './fileSystem';
import { recentFolders, removeRecentFolder } from './workspaceStore';
import { m } from '$lib/paraglide/messages';

export async function warnMissingFolder(path: string): Promise<void> {
	// session restore pushes paths through here too; only a listed one has anything to remove
	const listed = recentFolders.current.includes(path);
	const choice = await promptAsk({
		title: m.folder_missing_title(),
		message: m.folder_missing_body({ name: basename(path) }),
		detail: path,
		buttons: listed
			? [
					{ id: 'remove', label: m.folder_missing_remove(), primary: true },
					{ id: 'keep', label: m.folder_missing_keep() }
				]
			: [{ id: 'keep', label: m.folder_missing_ok(), primary: true }],
		cancelId: 'keep'
	});
	if (choice === 'remove') removeRecentFolder(path);
}
