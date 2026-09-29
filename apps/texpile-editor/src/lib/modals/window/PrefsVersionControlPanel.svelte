<script lang="ts">
	// The Version Control category, in Git's and VS Code's words so anyone who knows Git knows what
	// each row does: Git (Autofetch, VS Code's git.autofetch, and the user.name and user.email commits
	// carry) and Local History (copies of each file as it is saved, apart from Git).
	import { tip } from '$lib/components/tooltip.svelte';
	import { ChevronRight } from '@lucide/svelte';
	import { Switch } from '@skeletonlabs/skeleton-svelte';
	import { settings, updateSettings } from '$lib/settings';
	import { isDesktop, nativeBridge } from '$lib/workspace/fileSystem';
	import { workspaceRoot } from '$lib/workspace/workspaceStore';
	import { canKeepLocalHistory, localHistoryUsage, removeAllLocalHistory } from '$lib/workspace/localHistory/localHistory.svelte';
	import { promptAsk } from '$lib/modals/confirm.svelte';
	import { m } from '$lib/paraglide/messages';

	const ROW = 'border-surface-200-800 flex items-start justify-between gap-6 border-b py-4 last:border-b-0';

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

{#snippet label(text: string, hint = '')}
	<div class="min-w-0">
		<div class="text-sm font-medium">{text}</div>
		{#if hint}<p class="text-muted mt-1 text-xs leading-relaxed">{hint}</p>{/if}
	</div>
{/snippet}

{#snippet heading(text: string)}
	<h3 class="text-muted pt-4 pb-1 text-xs font-semibold tracking-wide uppercase">{text}</h3>
{/snippet}

{#snippet toggleRow(text: string, hint: string, checked: boolean, onChange: (v: boolean) => void)}
	<div class={ROW}>
		{@render label(text, hint)}
		<Switch {checked} onCheckedChange={(d) => onChange(d.checked)}>
			<Switch.Control><Switch.Thumb /></Switch.Control>
			<Switch.HiddenInput />
		</Switch>
	</div>
{/snippet}

{@render heading(m.prefs_group_git())}
<div class="pl-4">
	{@render toggleRow(m.prefs_check_new_versions(), m.prefs_check_new_versions_note(), settings.current.checkForNewVersions !== false, (v) =>
		updateSettings({ checkForNewVersions: v })
	)}
	{#if gitId}
		<div class={ROW}>
			{@render label(m.prefs_collab_git(), m.prefs_collab_git_note())}
			<div class="text-muted min-w-0 shrink-0 text-right text-sm">
				<div class="max-w-64 truncate">{gitId.name ?? m.prefs_collab_git_none()}</div>
				<div class="max-w-64 truncate text-xs" use:tip={gitId.email ?? ''}>{gitId.email ?? m.prefs_collab_git_none()}</div>
			</div>
		</div>
	{/if}
</div>

{#if canKeepLocalHistory()}
	{@render heading(m.prefs_group_local_history())}
	<div class="pl-4">
		{@render toggleRow(m.prefs_local_history(), m.prefs_local_history_note(), settings.current.localHistory !== false, (v) =>
			updateSettings({ localHistory: v })
		)}
		<div class="border-surface-200-800 border-b last:border-b-0">
			<button
				type="button"
				class="flex w-full items-center gap-1.5 py-4 text-left text-sm font-medium"
				aria-expanded={copiesOpen}
				onclick={() => (copiesOpen = !copiesOpen)}
			>
				<ChevronRight class="text-muted size-4 shrink-0 transition-transform {copiesOpen ? 'rotate-90' : ''}" />
				<span class="flex-1">{m.prefs_local_history_space()}</span>
				{#if historyBytes !== null}
					<span class="text-muted text-xs font-normal">{m.prefs_local_history_used({ size: sizeText(historyBytes) })}</span>
				{/if}
			</button>
			{#if copiesOpen}
				<div class="flex items-center justify-between gap-6 pb-4 pl-5.5">
					<p class="text-muted text-xs leading-relaxed">{m.prefs_local_history_clear_note()}</p>
					<button class="btn btn-sm preset-tonal shrink-0" onclick={clearHistory}>{m.prefs_local_history_clear()}</button>
				</div>
			{/if}
		</div>
	</div>
{/if}
