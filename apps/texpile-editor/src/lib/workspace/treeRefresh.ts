// Rescanning the workspace tree, and the follow-on work every rescan implies.
//
// The tree is a snapshot rather than a live view, so this runs on window focus, on our own
// fs-changed events, and on the provider's watch hook. Keeping the session manifest sync and the
// git refresh here means every trigger gets them for free from a single call site.
import { get } from 'svelte/store';
import { workspaceRoot, fileTree, texFiles } from '$lib/workspace/workspaceStore';
import { tabs } from '$lib/workspace/tabs.svelte';
import { refreshGitStatus, takeNoGitHint } from '$lib/workspace/gitStore';
import { toaster } from '$lib/modals/toaster-svelte';
import { m } from '$lib/paraglide/messages';
import type { TreeEntry } from '$lib/workspace/fileSystem';
import type { WorkspaceProvider } from '$lib/workspace/workspaceProvider';
import type { EditSession } from '$lib/collab/editSession';

/** every file path in the tree, flattened, for pruning tabs whose file vanished */
export const flatFiles = (es: TreeEntry[]): string[] => es.flatMap((e) => (e.type === 'dir' ? flatFiles(e.children ?? []) : [e.path]));

export interface TreeRefreshDeps {
	provider: WorkspaceProvider;
	session: EditSession;
	/** don't rebuild while the user is typing a name in the tree: a refresh would tear the inline
	 * input down mid-edit. It rescans once they commit. */
	isEditingTree(): boolean;
}

export async function refreshTree(deps: TreeRefreshDeps): Promise<void> {
	const { provider, session } = deps;
	const root = get(workspaceRoot);
	if (!root) return;
	if (deps.isEditingTree()) return;

	try {
		// one traversal when the provider can (disk); guests fall back to the two reads
		if (provider.scanTreeAndFiles) {
			const { children, files } = await provider.scanTreeAndFiles(root);
			fileTree.set(children);
			tabs.prune(flatFiles(children)); // tabs for files that vanished (remote deletes, external rm)
			texFiles.set(files);
		} else {
			const children = await provider.scanTree(root);
			fileTree.set(children);
			tabs.prune(flatFiles(children));
			texFiles.set(await provider.scanTexFiles(root));
		}
	} catch (e) {
		console.error('Failed to read folder tree:', e);
	}

	// shared session: the manifest mirrors the tree, same single call-site trick
	void session.syncTree();

	// Guests have no disk and no repo, and this runs on every manifest change, so don't spawn git
	// per remote file op. The refresh is non-blocking and never throws.
	if (!provider.caps.git) return;
	void refreshGitStatus(root).then(({ missingGit }) => {
		if (missingGit && takeNoGitHint()) {
			toaster.warning({ title: m.wsview_toast_no_git_title(), description: m.wsview_toast_no_git_desc() });
		}
	});
}
