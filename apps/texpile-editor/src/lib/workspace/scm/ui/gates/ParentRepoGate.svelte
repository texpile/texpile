<script lang="ts">
	// A repository found by looking upward, the way git does: used only once the author says so,
	// since saving a version here would record it in that repository with everything else in it.
	import { FolderTree, FolderUp, FolderGit2 } from '@lucide/svelte';
	import RepoPath from './RepoPath.svelte';
	import { tip } from '$lib/components/tooltip.svelte';
	import { m } from '$lib/paraglide/messages';

	let { repo, busy, onUse, onInit }: { repo: string; busy: boolean; onUse?: () => void; onInit: () => void } = $props();

	// both may wrap in a narrow panel
	const BUTTON = 'btn btn-xs h-auto gap-1.5 py-1 whitespace-normal';
</script>

<!-- px-3, as the panel's rows: at 24px a side a narrow sidebar left the words a thin column -->
<div class="@container flex flex-col items-center gap-3 px-3 py-6 text-center">
	<FolderTree class="text-faint size-8" />
	<p class="text-sm @max-[11rem]:text-xs">{m.vcs_parent_repo()}</p>
	<RepoPath path={repo} />
	<div class="flex w-full flex-col gap-1.5">
		<button class="{BUTTON} preset-filled-primary-500" onclick={onUse} disabled={busy} use:tip={m.vcs_parent_repo_use_tip()}>
			<FolderUp class="size-3.5 shrink-0 @max-[8rem]:hidden" />
			<span class="cap-center">{m.vcs_parent_repo_use()}</span>
		</button>
		<button
			class="{BUTTON} preset-outlined-surface-200-800 hover:preset-tonal"
			onclick={onInit}
			disabled={busy}
			use:tip={m.vcs_parent_repo_init_tip()}
		>
			<FolderGit2 class="size-3.5 shrink-0 @max-[8rem]:hidden" />
			<span class="cap-center">{m.vcs_parent_repo_init()}</span>
		</button>
	</div>
</div>
