// Lines added to the project folder's .gitignore: the build output patterns for its compile format,
// and a big new folder from its row's menu. Appended, never rewritten, and a line already there is
// not added again: the file may be hand-written.
import { workspaceRoot } from '../../workspaceStore';
import { refreshGitStatus } from '../gitStore';
import { basename, joinPath, relativeTo } from '../../fileSystem';
import { ignoreLineFor, withIgnoreLines } from '../gitignore';
import type { ScmDeps } from './scmActions.svelte';
import { toaster } from '$lib/modals/toaster-svelte';
import { m } from '$lib/paraglide/messages';

type IgnoreDeps = Pick<ScmDeps, 'ignoreLines' | 'writeText' | 'readTextIfPresent' | 'refreshTree'>;

export class ScmIgnore {
	constructor(
		private host: { busy: boolean },
		private deps: IgnoreDeps
	) {}

	/** the output PDF is deliberately not among the patterns */
	artifacts = (): Promise<void> => this.#append(this.deps.ignoreLines(), m.vcs_toast_ignored());

	/** The project folder's own .gitignore, which git reads for everything below it wherever the
	 *  repository starts. A folder's path ends in a slash, and so does its line. */
	files = (paths: string[]): Promise<void> => {
		const root = workspaceRoot.current;
		if (!root || !paths.length) return Promise.resolve();
		const lines = paths.map((p) => ignoreLineFor(relativeTo(root, p)));
		const title =
			paths.length === 1
				? m.vcs_toast_ignored_file({ name: basename(paths[0].replace(/[\\/]+$/, '')) })
				: m.vcs_toast_ignored_files({ count: paths.length });
		return this.#append(lines, title);
	};

	async #append(lines: string[], done: string): Promise<void> {
		const root = workspaceRoot.current;
		if (!root || this.host.busy) return;
		const path = joinPath(root, '.gitignore');
		this.host.busy = true;
		try {
			const next = withIgnoreLines(await this.deps.readTextIfPresent(path), lines);
			// null: every pattern is already there
			if (next !== null) await this.deps.writeText(path, next);
		} catch (e) {
			toaster.error({ title: m.vcs_toast_ignore_failed(), description: e instanceof Error ? e.message : String(e) });
			return;
		} finally {
			this.host.busy = false;
		}
		await this.deps.refreshTree();
		await refreshGitStatus(root);
		toaster.success({ title: done });
	}
}
