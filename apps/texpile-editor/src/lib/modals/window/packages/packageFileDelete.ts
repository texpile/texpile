import { GUEST_ROOT } from '$lib/collab/sessionProvider';
import { reloadSnippets } from '$lib/editor/snippets/file/snippetLoader';
import { confirmAsk } from '$lib/modals/confirm.svelte';
import { toaster } from '$lib/modals/toaster-svelte';
import { dirname, restoreEntry, trashEntry } from '$lib/workspace/fileSystem';
import type { PackageFileRow, PackageLayer } from './packageFileRows';
import { m } from '$lib/paraglide/messages';

/** why the folder's package files cannot be touched, empty when they can; a guest works on the host's folder */
export function packageFilesLocked(layer: PackageLayer, root: string | null): string {
	return layer === 'project' && root === GUEST_ROOT ? m.unavailable_guest() : '';
}

// the global folder is read again when it changes, the folder's only when asked
function reload(layer: PackageLayer, root: string | null): void {
	if (layer === 'project' && root) void reloadSnippets(root);
}

export async function deletePackageFile(row: PackageFileRow, root: string | null): Promise<void> {
	if (packageFilesLocked(row.layer, root) || (row.layer === 'project' && !root)) return;
	const confirmed = await confirmAsk(m.prefs_packages_delete_confirm({ name: row.name }), {
		confirmLabel: m.filetree_delete(),
		danger: true
	});
	if (!confirmed) return;
	try {
		const { backup, recycled } = await trashEntry(row.path, row.layer === 'project' ? root! : dirname(row.path));
		reload(row.layer, root);
		if (!backup) {
			if (recycled) toaster.info({ title: m.prefs_packages_deleted({ name: row.name }) });
			else toaster.error({ title: m.filehistory_delete_permanent_one(), description: m.filehistory_delete_permanent_desc() });
			return;
		}
		toaster.success({
			title: m.prefs_packages_deleted({ name: row.name }),
			action: {
				label: m.menubar_undo(),
				onClick: () =>
					void restoreEntry(backup, row.path)
						.then(() => reload(row.layer, root))
						.catch((e) => toaster.error({ title: m.wsview_toast_delete_failed_title(), description: String(e) }))
			}
		});
	} catch (e) {
		toaster.error({ title: m.wsview_toast_delete_failed_title(), description: e instanceof Error ? e.message : String(e) });
	}
}
