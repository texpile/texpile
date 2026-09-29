// source control ops: call the git client, refresh status, toast on failure. the panel is
// presentational; WorkspaceView wires the deps.
import { workspaceRoot } from '../../workspaceStore';
import {
	refreshGitStatus,
	refreshGitHistory,
	isGitRepo,
	isConflicted,
	gitChanges,
	gitBranch,
	gitHasCommits,
	gitOperation,
	gitRunning,
	setGitWriting
} from '../gitStore';
import {
	gitInit,
	gitStage,
	gitUnstage,
	gitCommit,
	gitRestore,
	gitRestoreInTheWay,
	gitChangesSince,
	gitIdentity,
	gitSetIdentity,
	gitRemotes,
	gitAddRemote,
	gitPublish,
	gitSync,
	githubPublish,
	gitRecheck,
	type GitStatusEntry,
	type GitFileChange,
	type GitRemote,
	type GitPushResult
} from '../git';
import { askIdentity, askPublish, type PublishChoice } from '../gitDialogs.svelte';
import { ScmCombine } from '../branches/scmCombine.svelte';
import { ScmBranches } from '../branches/scmBranches.svelte';
import { ScmIgnore } from './scmIgnore.svelte';
import { ScmDiscard } from './scmDiscard.svelte';
import { autoCheckDone, resumeAutoCheck } from './scmAutoCheck.svelte';
import { uploadReason } from '../../uploadReason';
import { toastGitFailure } from '../gitFailureToast';
import { localGitReason } from '../gitLocalReason';
import { saveChangesFirst } from './scmSaveFirst';
import { basename, samePath } from '../../fileSystem';
import { confirmAsk } from '$lib/modals/confirm.svelte';
import { toaster } from '$lib/modals/toaster-svelte';
import { m } from '$lib/paraglide/messages';

export type ScmDeps = {
	getLoadedPath(): string | null;
	/** drop the open file's queued autosave before git rewrites it on disk. */
	discardPendingSave(): void;
	/** an edit is typed but not yet on disk. With autosave off that is everything since the last
	 *  manual save, and git cannot see any of it. */
	hasPendingSave(): boolean;
	/** write that edit out and wait for it to land, so git can see it */
	flushPendingSave(): Promise<void>;
	/** the queued edit taken off the queue unwritten: after a flush, one the save guard turned away */
	detachPendingSave?(): { path: string; content: string } | null;
	/** to the Trash; 'kept' where there is none, and the entry is still there */
	trashEntry(path: string): Promise<'trashed' | 'kept'>;
	/** deleted outright, once the author has agreed to it */
	removeEntry(path: string): Promise<void>;
	refreshTree(): Promise<void>;
	loadFile(path: string): Promise<void>;
	/** re-diff the open comparison (after a commit moved HEAD). */
	captureDiffSnapshot(): void;
	isDiffMode(): boolean;
	/** open (or focus) a tab comparing `path` against one version. */
	openCompareTab(path: string, compare: { hash: string; subject: string }): void;
	/** open a file in the source editor at a 1-based line, whatever view the author has chosen */
	openAtLine(path: string, line: number): void;
	/** the merge is saved: the open file, if it held marked places, goes back to the author's view */
	settleConflicts(): void;
	/** the .gitignore patterns for this project's compile format */
	ignoreLines(): string[];
	writeText(path: string, content: string): Promise<void>;
	/** null when the file does not exist yet */
	readTextIfPresent(path: string): Promise<string | null>;
};

export class ScmActions {
	#busy = $state(false);

	/** Source Control is writing to the repository. Status refreshes wait for it to finish: one
	 *  arriving mid-write from the watcher or a window focus raced it for .git/index.lock. */
	get busy(): boolean {
		return this.#busy;
	}
	set busy(on: boolean) {
		this.#busy = on;
		setGitWriting(on);
	}

	/** Sync's Combine now, and the Finish and Cancel that end a merge */
	readonly combine: ScmCombine;
	/** the branch picker behind the branch name */
	readonly branches: ScmBranches;
	/** names on versions, from History */
	readonly ignore: ScmIgnore;
	readonly discarder: ScmDiscard;

	constructor(private deps: ScmDeps) {
		this.combine = new ScmCombine(this, deps);
		this.branches = new ScmBranches(this, deps);
		this.ignore = new ScmIgnore(this, deps);
		this.discarder = new ScmDiscard(this, deps);
	}

	/** after installing git: forget that it was missing and look again */
	recheckGit = async (): Promise<void> => {
		const root = workspaceRoot.current;
		if (!root) return;
		await gitRecheck();
		const { missingGit } = await refreshGitStatus(root);
		if (missingGit) toaster.warning({ title: m.vcs_git_still_missing() });
	};

	/** an unfinished merge, rebase or cherry-pick: what else would run now records it half-done */
	private blockedByOperation(): boolean {
		if (!gitOperation.current) return false;
		toaster.warning({ title: m.vcs_toast_finish_first() });
		return true;
	}

	init = async () => {
		const root = workspaceRoot.current;
		if (!root) return;
		this.busy = true;
		const res = await gitInit(root);
		this.busy = false;
		if (!res.ok) {
			// git missing has no error text of its own: the toast used to have an empty description
			const why = res.reason === 'no-git' ? m.vcs_git_missing() : localGitReason(res.error);
			toastGitFailure(m.wsview_toast_git_init_failed_title(), why, res);
			return;
		}
		await refreshGitStatus(root);
		toaster.success({ title: m.wsview_toast_git_init_success_title() });
	};

	stage = async (paths: string[]) => {
		const root = workspaceRoot.current;
		if (!root) return;
		this.busy = true;
		const res = await gitStage(root, paths);
		this.busy = false;
		if (!res.ok) toastGitFailure(m.vcs_toast_save_failed(), localGitReason(res.error), res);
		await refreshGitStatus(root);
	};

	unstage = async (paths: string[]) => {
		const root = workspaceRoot.current;
		if (!root) return;
		this.busy = true;
		const res = await gitUnstage(root, paths);
		this.busy = false;
		if (!res.ok) toastGitFailure(m.vcs_toast_save_failed(), localGitReason(res.error), res);
		await refreshGitStatus(root);
	};

	/** throw changes away (scmDiscard.svelte.ts) */
	discard = (changes: GitStatusEntry[]): Promise<void> => this.discarder.run(changes);

	/** the index is reset and rebuilt from the tick boxes every time, so what the button promised
	 *  is what lands and a stale staged file cannot ride along. `root` is the folder the caller began
	 *  in, which after a slow Sync may no longer be the one open. */
	commit = async (message: string, paths: string[], root = workspaceRoot.current): Promise<boolean> => {
		// one at a time: a held Ctrl+Enter repeats, and each repeat started another commit
		if (!root || !paths.length || this.busy) return false;
		// busy from the start: Save version must not be pressable again behind the identity dialog
		this.busy = true;
		gitRunning.current = 'save';
		try {
			if (!(await this.ensureIdentity(root))) return false;
			function failed(error?: string): boolean {
				toastGitFailure(m.vcs_toast_save_failed(), localGitReason(error), { error });
				return false;
			}
			// an edit still waiting for autosave is what the author means by this version; written out
			// first, as Restore and Sync already do, or the version quietly leaves it behind
			const include = [...paths];
			const loadedPath = this.deps.getLoadedPath();
			if (this.deps.hasPendingSave()) {
				// a file that was not listed until now could not have been unticked, so it goes in too
				const listed = loadedPath !== null && gitChanges.current.some((c) => samePath(c.path, loadedPath));
				await this.deps.flushPendingSave();
				if (loadedPath && !listed) {
					await refreshGitStatus(root, true); // read without letting go of busy
					if (gitChanges.current.some((c) => samePath(c.path, loadedPath))) include.push(loadedPath);
				}
			}
			// Files both sides changed with no merge under way: what a stash that did not apply cleanly
			// leaves (a merge is saved by Finish combining instead). Once every place in them is chosen
			// they go in with the version, which is what marks them settled; before that the version
			// waits, or the reset below would turn them into ordinary edits with the markers still in.
			const conflicted = gitChanges.current.filter((c) => isConflicted(c.x, c.y));
			if (conflicted.some((c) => c.markers)) {
				toastGitFailure(m.vcs_toast_save_failed(), m.vcs_error_conflicts_save(), {});
				return false;
			}
			include.push(...conflicted.map((c) => c.path));
			// a rename goes in whole: the new name, and the old one it no longer has
			for (const c of gitChanges.current) if (c.from && include.some((p) => samePath(p, c.path))) include.push(c.from);
			const clear = await gitUnstage(root, []);
			if (!clear.ok) return failed(clear.error);
			const staged = await gitStage(root, include);
			if (!staged.ok) return failed(staged.error);
			const res = await gitCommit(root, message);
			if (!res.ok) return failed(res.error);
		} finally {
			this.busy = false;
			gitRunning.current = null;
		}
		await refreshGitStatus(root);
		await refreshGitHistory(root);
		if (this.deps.isDiffMode()) this.deps.captureDiffSnapshot(); // the open diff now compares against the new HEAD
		toaster.success({ title: m.vcs_toast_version_saved() });
		return true;
	};

	/** git will not commit without a name and an email, and says so in words that send someone to
	 *  a terminal to type two config commands. Those two commands, asked here instead - once per
	 *  machine, since they are written globally. */
	async ensureIdentity(root: string): Promise<boolean> {
		const who = await gitIdentity(root);
		if (who.name && who.email) return true;
		const answer = await askIdentity({ name: who.name ?? '', email: who.email ?? '' });
		if (!answer) return false;
		const res = await gitSetIdentity(root, answer.name, answer.email);
		if (!res.ok) toastGitFailure(m.vcs_identity_failed(), localGitReason(res.error), res);
		return res.ok;
	}

	/** Clears the way for a restore, and asks about it first.
	 *
	 *  Returns false when the answer was no, or when saving failed. Nothing is written before the
	 *  answer: with autosave off, a Restore that was cancelled must not have saved the file as a
	 *  side effect of being considered. */
	private async saveBeforeRestore(root: string, entry: { hash: string; subject: string }): Promise<boolean> {
		// only work the restore would overwrite: a file unticked to stay on this computer is left alone
		async function inTheWay(): Promise<string[]> {
			const res = await gitRestoreInTheWay(root, entry.hash);
			return res.ok ? (res.files ?? []) : [];
		}
		const dirty = this.deps.hasPendingSave() || (await inTheWay()).length > 0;

		const ok = await confirmAsk(
			dirty ? m.vcs_confirm_restore_unsaved({ name: entry.subject }) : m.vcs_confirm_restore({ name: entry.subject }),
			{
				detail: dirty ? undefined : m.vcs_confirm_restore_detail(),
				confirmLabel: dirty ? m.vcs_save_and_restore() : m.vcs_restore()
			}
		);
		if (!ok || !dirty) return ok;

		await this.deps.flushPendingSave();
		await refreshGitStatus(root); // the edit is on disk now, so git can finally count it
		const paths = await inTheWay();
		if (!paths.length) return true; // what was queued is in no file the restore rewrites
		return this.commit(m.vcs_restore_presave({ name: entry.subject }), paths, root);
	}

	/** additive: recorded as a new commit, so restoring the entry above undoes it.
	 *  Takes the ENTRY, like compare does - the panel has only ever handed one over, and taking a
	 *  hash and a subject instead meant the entry arrived as `hash` and the subject as undefined. */
	restore = async (entry: { hash: string; subject: string }): Promise<boolean> => {
		const root = workspaceRoot.current;
		if (!root) return false;
		if (this.blockedByOperation()) return false;

		// Work that would be in the way, counted BEFORE asking - the restore refuses over uncommitted
		// work in a file it rewrites, and being refused after confirming reads as a bug. Only TRACKED changes count: gitRestore
		// checks --untracked-files=no, so an untracked file neither blocks it nor belongs in the
		// version below, having never been chosen for the repo. The typed-but-unwritten edit counts
		// too, and git cannot see it - that is exactly the work the old discard threw away in silence.
		if (!(await this.saveBeforeRestore(root, entry))) return false;
		// restoring writes a version, and on a clean tree it does so without passing through commit()
		if (!(await this.ensureIdentity(root))) return false;

		this.busy = true;
		const res = await gitRestore(root, entry.hash, m.vcs_restore_message({ name: entry.subject }));
		this.busy = false;
		if (!res.ok && res.failure === 'same') {
			toaster.info({ title: m.vcs_restore_same() });
			return false;
		}
		if (!res.ok) {
			// new files in the way are named, so they can be saved in a version (or renamed) first
			const names = (res.untracked ?? []).map((p) => basename(p)).join(', ');
			toastGitFailure(m.vcs_toast_restore_failed(), names ? m.vcs_restore_untracked({ files: names }) : localGitReason(res.error), res);
			return false;
		}
		const loadedPath = this.deps.getLoadedPath();
		await this.deps.refreshTree();
		await refreshGitStatus(root);
		await refreshGitHistory(root);
		if (loadedPath) await this.deps.loadFile(loadedPath); // its bytes on disk just changed
		toaster.success({ title: m.vcs_toast_restored() });
		return true;
	};

	/** build output and big new folders into .gitignore (scmIgnore.svelte.ts) */
	ignoreArtifacts = (): Promise<void> => this.ignore.artifacts();
	ignoreFiles = (paths: string[]): Promise<void> => this.ignore.files(paths);

	/** against the last saved version, in its own tab */
	openDiff = (path: string) => {
		if (!isGitRepo.current) return;
		this.deps.openCompareTab(path, { hash: 'HEAD', subject: m.vcs_last_version() });
	};

	/** the panel hands over the file rather than asking the editor what happens to be open */
	compare = (entry: { hash: string; subject: string }, path: string) => {
		if (!isGitRepo.current || !path) return;
		this.deps.openCompareTab(path, { hash: entry.hash, subject: entry.subject });
	};

	/** VS Code's Publish Branch: give a branch with no upstream one. With exactly one remote there is
	 *  nothing to choose, so it goes straight there; otherwise the dialog offers each remote, a new
	 *  GitHub repository, or an address. */
	publish = async (): Promise<void> => {
		const root = workspaceRoot.current;
		const branch = gitBranch.current;
		if (!root || !branch || this.busy) return;
		// before the first version the branch has a name and nothing on it: a GitHub repository made
		// now would stay empty, the upload refused ("src refspec main does not match any")
		if (!gitHasCommits.current) {
			toaster.error({ title: m.vcs_toast_publish_failed(), description: m.vcs_publish_empty() });
			return;
		}
		// busy while the remotes are read too: a second click in that moment pushed twice
		this.busy = true;
		const listed = await gitRemotes(root);
		const remotes = listed.ok ? (listed.remotes ?? []) : [];
		if (remotes.length === 1) {
			gitRunning.current = 'publish';
			const res = await gitPublish(root, remotes[0].name).finally(() => {
				this.busy = false;
				gitRunning.current = null;
			});
			const problem = await this.published(root, res);
			if (problem) toastGitFailure(m.vcs_toast_publish_failed(), problem, res);
			return;
		}
		this.busy = false;
		await askPublish({
			branch,
			remotes,
			defaultName: basename(root)
				.trim()
				.replace(/[^A-Za-z0-9_.-]+/g, '-'),
			submit: (choice) => this.publishTo(root, choice)
		});
	};

	/** Runs one choice from the Publish dialog. Resolves to the problem to show in the dialog - ''
	 *  for none, when the author closed the sign-in prompt - or null when the dialog is done. */
	private publishTo = async (root: string, choice: PublishChoice): Promise<string | null> => {
		this.busy = true;
		gitRunning.current = 'publish';
		try {
			if (choice.kind === 'remote') return await this.published(root, await gitPublish(root, choice.remote));

			// read again rather than trusting the dialog's list: an attempt that failed after adding
			// its remote has already changed it, and adding the same address twice would fail
			const listed = await gitRemotes(root);
			const current = listed.ok ? (listed.remotes ?? []) : [];

			if (choice.kind === 'url') {
				const known = current.find((r) => r.url === withoutSignIn(choice.url));
				const name = known?.name ?? freeRemoteName(current, ['origin']);
				if (!known) {
					const added = await gitAddRemote(root, name, choice.url);
					if (!added.ok) return added.error ? `${m.vcs_publish_bad_url()}\n${added.error}` : m.vcs_publish_bad_url();
				}
				return await this.published(root, await gitPublish(root, name));
			}

			const res = await githubPublish(root, {
				name: choice.name,
				isPrivate: choice.isPrivate,
				remote: freeRemoteName(current, ['origin', 'github'])
			});
			if (res.ok) {
				await refreshGitStatus(root);
				const url = res.url;
				toaster.success({
					title: m.vcs_toast_published_github({ name: res.fullName ?? choice.name }),
					action: url ? { label: m.vcs_open_on_github(), onClick: () => void window.open(url, '_blank') } : undefined
				});
				return null;
			}
			if (res.failure === 'cancelled') return '';
			if (res.url) {
				// The repository exists and is already this project's remote; only the upload after it
				// failed. Trying again from here would try to create it again, so the dialog closes and
				// Publish - which now finds exactly that one remote - retries just the upload.
				await refreshGitStatus(root);
				toastGitFailure(
					m.vcs_toast_publish_failed(),
					m.vcs_publish_created_not_uploaded({ name: res.fullName ?? choice.name, reason: uploadReason(res) }),
					res
				);
				return null;
			}
			if (res.failure === 'exists') return m.vcs_publish_exists();
			if (res.failure === 'scope') return m.vcs_publish_scope();
			if (res.failure === 'auth') return m.vcs_publish_github_auth();
			return uploadReason({ ...res, failure: res.failure === 'network' ? 'network' : 'other', remote: 'GitHub' });
		} finally {
			this.busy = false;
			gitRunning.current = null;
		}
	};

	/** after a push -u: '' when the author cancelled signing in, the reason it failed, or null */
	private async published(root: string, res: GitPushResult): Promise<string | null> {
		if (!res.ok && res.failure === 'rejected') return m.vcs_publish_rejected({ remote: res.remote ?? '' });
		if (!res.ok) return res.failure === 'cancelled' ? '' : uploadReason(res);
		await refreshGitStatus(root); // the branch tracks something now, and the panel shows Sync
		toaster.success({ title: m.vcs_toast_published({ remote: res.remote ?? '' }) });
		return null;
	}

	/**
	 * VS Code's Sync: fetch, take in the remote's versions, send this branch's. It never leaves the
	 * project half-combined - a conflict is undone and named, and unsaved work that would be
	 * overwritten stops it before anything is tried.
	 *
	 * A typed edit still waiting to be written goes to disk first. Otherwise git cannot see it, so
	 * cannot refuse to overwrite it, and the write landing after the sync would quietly undo what
	 * came in.
	 */
	sync = async (): Promise<void> => {
		const root = workspaceRoot.current;
		if (!root || this.busy) return;
		await autoCheckDone(); // one fetch at a time
		if (this.busy || this.blockedByOperation()) return;
		this.busy = true;
		gitRunning.current = 'sync';
		let again = false;
		try {
			// a merge commit, which git refuses without user.name and user.email; git writes its message
			if (!(await this.ensureIdentity(root))) return;
			if (this.deps.hasPendingSave()) await this.deps.flushPendingSave();
			const res = await gitSync(root);
			if (res.ok) resumeAutoCheck();
			// Another folder was opened while the network was slow. Reloading, merging and committing
			// would all act on that one, so for this one there is only the notice of how it went.
			const switched = !samePath(workspaceRoot.current ?? '', root);
			if (res.ok && res.pulled && !switched) {
				// files changed on disk under the editor: the same reload a restore does
				const loadedPath = this.deps.getLoadedPath();
				await this.deps.refreshTree();
				if (loadedPath) await this.deps.loadFile(loadedPath);
				if (this.deps.isDiffMode()) this.deps.captureDiffSnapshot();
			}
			// even a failed sync fetched, so the counts beside the button are news either way
			await refreshGitStatus(root);
			if (res.ok && (res.pulled || res.pushed)) await refreshGitHistory(root);
			const remote = res.remote ?? '';
			if (res.ok) {
				// name what moved, and only the direction something moved in
				const pulled = res.pulled ?? 0;
				const pushed = res.pushed ?? 0;
				const moved = [
					...(pulled ? [pulled === 1 ? m.vcs_sync_received_one() : m.vcs_sync_received_count({ count: pulled })] : []),
					...(pushed ? [pushed === 1 ? m.vcs_sync_sent_one() : m.vcs_sync_sent_count({ count: pushed })] : [])
				];
				if (moved.length) toaster.success({ title: m.vcs_toast_synced({ remote }), description: moved.join(' · ') });
				else toaster.info({ title: m.vcs_toast_sync_uptodate({ remote }) });
			} else if (res.failure === 'conflict' && !switched) {
				await this.combine.offer(root, res);
			} else if (res.failure === 'dirty' && !switched) {
				// unsaved work that taking in versions would overwrite: saved as a version, then Sync again
				again = await saveChangesFirst(
					{ root, commit: (message, paths) => this.commit(message, paths, root), setBusy: (on) => (this.busy = on) },
					{
						title: m.vcs_sync_dirty_title(),
						message: uploadReason(res),
						confirm: m.vcs_sync_save_and_sync(),
						version: m.vcs_sync_autosave_message(),
						blocking: res.files
					}
				);
			} else if (res.failure !== 'cancelled') {
				toastGitFailure(m.vcs_toast_sync_failed(), uploadReason(res), res);
			}
		} finally {
			this.busy = false;
			gitRunning.current = null;
		}
		// sync() reads the folder open now: again only while that is still this one
		if (again && samePath(workspaceRoot.current ?? '', root)) await this.sync();
	};

	/** read on expand, not with the log: the answer changes as the author types */
	changesSince = async (hash: string): Promise<GitFileChange[]> => {
		const root = workspaceRoot.current;
		if (!root || !isGitRepo.current) return [];
		const res = await gitChangesSince(root, hash);
		return res.ok ? (res.entries ?? []) : [];
	};
}

/** as electron/src/git/remote/gitRemote.ts hands remotes over: an http(s) address without its user part */
function withoutSignIn(url: string): string {
	return url.replace(/^(https?:\/\/)[^/]*@/i, '$1');
}

/** the first of `preferred` no remote is called yet, else origin2, origin3, ... */
function freeRemoteName(remotes: GitRemote[], preferred: string[]): string {
	const taken = new Set(remotes.map((r) => r.name));
	const free = preferred.find((n) => !taken.has(n));
	if (free) return free;
	let i = 2;
	while (taken.has(`origin${i}`)) i++;
	return `origin${i}`;
}
