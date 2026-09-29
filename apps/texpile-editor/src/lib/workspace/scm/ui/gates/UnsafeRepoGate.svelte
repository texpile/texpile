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

<div class="flex flex-col items-center gap-3 p-6 text-center">
	<ShieldAlert class="text-warning-ink size-8" />
	<p class="text-sm">{m.vcs_unsafe()}</p>
	<RepoPath path={repo} />
	{#if canTrustRepo()}
		<button
			class="btn btn-xs preset-filled-primary-500 w-full gap-1.5"
			onclick={trust}
			disabled={trusting}
			use:tip={m.vcs_unsafe_trust_tip()}
		>
			{#if trusting}<LoaderCircle class="size-3.5 animate-spin" />{:else}<ShieldCheck class="size-3.5" />{/if}
			{trusting ? m.vcs_running_trust() : m.vcs_unsafe_trust()}
		</button>
	{/if}
</div>
