// Switch branch's list: the local branches other than the one checked out, most recently worked on
// first, each with the remote branch it syncs with, then the branches only on a remote (a
// co-author's). VS Code's Git: Checkout to..., without tags: Texpile does not start branches, and
// this is the way to one that exists.
import { GitBranch, Cloud } from '@lucide/svelte';
import { scmHandlers } from '$lib/workspace/scm/actions/scmHandlers.svelte';
import type { GitBranchesResult } from '$lib/workspace/scm/branches/gitBranches';
import type { PaletteItem } from './paletteCommands';
import { m } from '$lib/paraglide/messages';

/** exported for the tests */
export function branchItemsFrom(res: GitBranchesResult, switchTo: (name: string) => void): PaletteItem[] {
	if (!res.ok) return [];
	const local = (res.local ?? [])
		.filter((b) => b.name !== res.current)
		.map((b) => ({
			id: `branch:${b.name}`,
			label: b.name,
			group: m.vcs_branch_group(),
			hint: b.upstream ?? undefined,
			icon: GitBranch,
			run: () => switchTo(b.name)
		}));
	const remote = (res.remote ?? []).map((b) => ({
		id: `remote-branch:${b.name}`,
		label: b.name,
		group: m.vcs_branch_remote_group(),
		icon: Cloud,
		run: () => switchTo(b.name)
	}));
	return [...local, ...remote];
}

export async function branchItems(): Promise<PaletteItem[]> {
	const h = scmHandlers.current;
	if (!h) return [];
	return branchItemsFrom(await h.listBranches(), (name) => scmHandlers.current?.switchBranch(name));
}
