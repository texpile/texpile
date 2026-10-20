<script lang="ts">
	// The Version Control category, in Git's and VS Code's words so anyone who knows Git knows what
	// each row does: Git (Autofetch, VS Code's git.autofetch, and the user.name and user.email commits
	// carry) and Local History (copies of each file as it is saved, apart from Git).
	import { tip } from '$lib/components/tooltip.svelte';
	import { ChevronRight } from '@lucide/svelte';
	import { settings, updateSettings } from '$lib/settings';
	import { isDesktop, nativeBridge } from '$lib/workspace/fileSystem';
	import { workspaceRoot } from '$lib/workspace/workspaceStore';
	import { canKeepLocalHistory, localHistoryUsage, removeAllLocalHistory } from '$lib/workspace/localHistory/localHistory.svelte';
	import { promptAsk } from '$lib/modals/confirm.svelte';
	import PrefsHeading from './rows/PrefsHeading.svelte';
	import PrefsRow from './rows/PrefsRow.svelte';
	import PrefsSwitchRow from './rows/PrefsSwitchRow.svelte';
	import { m } from '$lib/paraglide/messages';

	// what git config says in the open folder: read-only here, set with git config
	let gitId = $state<{ name: string | null; email: string | null } | null>(null);
	const root = workspaceRoot.current;
	if (isDesktop() && root)
		void nativeBridge()
			?.gitIdentity?.(root)
			.then((r) => (gitId = { name: r.name, email: r.email }))
			.catch(() => undefined);

	// how much Local History takes, said on the fold that holds Clear: on a portable copy it is
	// space on the drive
	let historyBytes = $state<number | null>(null);
	// Clear sits folded away: it is rarely wanted and cannot be undone
	let copiesOpen = $state(false);
	if (canKeepLocalHistory()) void localHistoryUsage().then((n) => (historyBytes = n));

	function sizeText(bytes: number): string {
		// a few bytes still read as 1 KB, but nothing left after Clear reads as nothing
		if (bytes < 1024 * 1024) return `${bytes === 0 ? 0 : Math.max(1, Math.round(bytes / 1024))} KB`;
		return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
	}

	async function clearHistory() {
		const answer = await promptAsk({
			message: m.history_delete_all_message(),
			detail: m.history_irreversible(),
			buttons: [
				{ id: 'delete', label: m.history_delete_all(), primary: true },
				{ id: 'cancel', label: m.vcs_cancel() }
			],
			cancelId: 'cancel',
			danger: true
		});
		if (answer !== 'delete') return;
		await removeAllLocalHistory();
		historyBytes = await localHistoryUsage();
	}
</script>

<PrefsHeading section="git" />
<div class="pl-4">
	<PrefsSwitchRow
		id="check-new-versions"
		checked={settings.current.checkForNewVersions !== false}
		onChange={(v) => updateSettings({ checkForNewVersions: v })}
	/>
	{#if gitId}
		<PrefsRow id="git-identity">
			<div class="text-muted min-w-0 text-right text-sm">
				<div class="max-w-64 truncate">{gitId.name ?? m.prefs_collab_git_none()}</div>
				<div class="max-w-64 truncate text-xs" use:tip={gitId.email ?? ''}>{gitId.email ?? m.prefs_collab_git_none()}</div>
			</div>
		</PrefsRow>
	{/if}
</div>

{#if canKeepLocalHistory()}
	<PrefsHeading section="localHistory" />
	<div class="pl-4">
		<PrefsSwitchRow
			id="local-history"
			checked={settings.current.localHistory !== false}
			onChange={(v) => updateSettings({ localHistory: v })}
		/>
		<PrefsRow id="local-history-space" layout="block">
			{#snippet children(def)}
				<button
					type="button"
					class="flex w-full items-center gap-1.5 text-left text-sm font-medium"
					aria-expanded={copiesOpen}
					onclick={() => (copiesOpen = !copiesOpen)}
				>
					<ChevronRight class="text-muted size-4 shrink-0 transition-transform {copiesOpen ? 'rotate-90' : ''}" />
					<span class="flex-1">{def.label()}</span>
					{#if historyBytes !== null}
						<span class="text-muted text-xs font-normal">{m.prefs_local_history_used({ size: sizeText(historyBytes) })}</span>
					{/if}
				</button>
				{#if copiesOpen}
					<div class="flex items-center justify-between gap-6 pt-4 pl-5.5">
						<p class="text-muted text-xs leading-relaxed">{def.note?.()}</p>
						<button class="btn btn-sm preset-tonal shrink-0" onclick={clearHistory}>{m.prefs_local_history_clear()}</button>
					</div>
				{/if}
			{/snippet}
		</PrefsRow>
	</div>
{/if}
