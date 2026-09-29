<script lang="ts">
	// A repository git will not work in because another account on this computer owns its folder: a
	// USB or network drive, or a project copied from another user. It used to read as "not a
	// repository", with an Initialize that did nothing. Trusting it is asked, not assumed: git's
	// check exists because a repository's own settings can run programs.
	import { ShieldAlert, ShieldCheck, LoaderCircle } from '@lucide/svelte';
	import { tip } from '$lib/components/tooltip.svelte';
	import RepoPath from './RepoPath.svelte';
	import { promptAsk } from '$lib/modals/confirm.svelte';
	import { toaster } from '$lib/modals/toaster-svelte';
	import { canTrustRepo, gitTrustRepo } from '$lib/workspace/scm/gitTrust';
	import { refreshGitStatus, refreshGitHistory } from '$lib/workspace/scm/gitStore';
	import { m } from '$lib/paraglide/messages';

	let { root, repo }: { root: string; repo: string } = $props();
	let trusting = $state(false);

	async function trust() {
		const answer = await promptAsk({
			title: m.vcs_unsafe_confirm_title(),
			message: m.vcs_unsafe_confirm({ path: repo }),
			detail: m.vcs_unsafe_confirm_detail(),
			buttons: [
				{ id: 'trust', label: m.vcs_unsafe_mark_safe(), primary: true },
				{ id: 'cancel', label: m.vcs_cancel() }
			],
			cancelId: 'cancel'
		});
		if (answer !== 'trust') return;
		trusting = true;
		const res = await gitTrustRepo(root);
		if (!res.ok) {
			trusting = false;
			toaster.error({ title: m.vcs_unsafe_failed(), description: res.error });
			return;
		}
		// still turning until the panel has read the repository it may now use, so the click is
		// answered all the way to the screen that replaces this one
		await refreshGitStatus(root);
		await refreshGitHistory(root);
		trusting = false;
	}
</script>

<!-- px-3 as the panel's rows: at 24px a side a narrow sidebar left the words a column one or two wide -->
<div class="@container flex flex-col items-center gap-3 px-3 py-6 text-center">
	<!-- faint, as the other gates' icons: the words say what is wrong -->
	<ShieldAlert class="text-faint size-8" />
	<p class="text-sm @max-[11rem]:text-xs">{m.vcs_unsafe()}</p>
	<RepoPath path={repo} />
	{#if canTrustRepo()}
		<button
			class="btn btn-xs preset-filled-primary-500 w-full gap-1.5 whitespace-normal"
			onclick={trust}
			disabled={trusting}
			use:tip={m.vcs_unsafe_trust_tip()}
		>
			{#if trusting}<LoaderCircle class="size-3.5 shrink-0 animate-spin @max-[8rem]:hidden" />{:else}<ShieldCheck
					class="size-3.5 shrink-0 @max-[8rem]:hidden"
				/>{/if}
			<span class="cap-center min-w-0 overflow-x-clip text-ellipsis">{trusting ? m.vcs_running_trust() : m.vcs_unsafe_trust()}</span>
		</button>
	{/if}
</div>
