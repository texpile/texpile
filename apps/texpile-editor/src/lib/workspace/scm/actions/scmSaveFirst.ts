// Unsaved work in the way of a branch switch or a Sync, saved as a version first and then the
// operation tried again. A writer's word for keeping work safe is a version; VS Code offers to
// stash it instead, which puts it somewhere nobody who does not know git will look for it.
import { gitChanges, refreshGitStatus } from '../gitStore';
import { workspaceRoot } from '../../workspaceStore';
import { scmDraftFor } from './scmDraft.svelte';
import { relativeInside, samePath } from '../../fileSystem';
import type { GitStatusEntry } from '../git';
import { promptAsk } from '$lib/modals/confirm.svelte';
import { m } from '$lib/paraglide/messages';

/** the operation that asked: the folder it began in, how to save a version there, and its busy
 *  flag, handed back while the save runs */
type Host = { root: string; commit(message: string, paths: string[]): Promise<boolean>; setBusy(on: boolean): void };

/** true once what is staged, and what is in the way, is saved as a version; false when the author
 *  said no, or saving failed */
export async function saveChangesFirst(
	host: Host,
	ask: { title: string; message: string; detail?: string; confirm: string; version: string; blocking?: string[] }
): Promise<boolean> {
	const choice = await promptAsk({
		title: ask.title,
		message: ask.message,
		detail: ask.detail,
		buttons: [
			{ id: 'save', label: ask.confirm, primary: true },
			{ id: 'cancel', label: m.vcs_cancel() }
		],
		cancelId: 'cancel'
	});
	if (choice !== 'save') return false;
	// Read again first: the busy flag held status refreshes back, so the list is from before the
	// caller wrote the waiting edit to disk, and that edit is often the very file in the way. Read
	// as the caller's own, still busy, so nothing else can be pressed in between.
	await refreshGitStatus(host.root, true);
	// the list is the open folder's: with another opened meanwhile, none of it is this one's
	if (!samePath(workspaceRoot.current ?? '', host.root)) return false;
	// What the panel has staged, so a file unstaged to stay on this computer is not committed and
	// then pushed. Unless git named it as in the way (a main.bbl a co-author saved, and a build made
	// here as well): leaving that out would save nothing that helps, and the button would do nothing
	function inTheWay(c: GitStatusEntry): boolean {
		return (ask.blocking ?? []).some((f) => samePath(f, c.path) || (!!c.files && !!relativeInside(c.path, f)));
	}
	const draft = scmDraftFor(host.root);
	const paths = gitChanges.current.filter((c) => inTheWay(c) || draft.ticked(c)).map((c) => c.path);
	if (!paths.length) return false;
	// commit keeps its own busy state; the operation that asked takes it back after
	host.setBusy(false);
	try {
		return await host.commit(ask.version, paths);
	} finally {
		host.setBusy(true);
	}
}
