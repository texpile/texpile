<script lang="ts">
	// Sync and Publish, in the two places the panel offers them: the control beside the branch, named
	// in words there as in the main button, and the main button when nothing is waiting to be saved
	// (VS Code's action button). While one of them runs, the button says so rather than only greying
	// out, which read as broken on a slow link. Fetch is in the command palette: Autofetch already puts
	// what there is to pull on this button.
	import { tip } from '$lib/components/tooltip.svelte';
	import { ArrowUp, ArrowDown, ArrowDownUp, CloudUpload, LoaderCircle } from '@lucide/svelte';
	import { gitRunning } from '$lib/workspace/scm/gitStore';
	import type { GitOperation } from '$lib/workspace/scm/git';
	import { m } from '$lib/paraglide/messages';
	import { getLocale, type Locale } from '$lib/paraglide/runtime';

	type Props = {
		place: 'header' | 'action';
		tracking: string | null;
		ahead: number;
		behind: number;
		hasCommits: boolean;
		detached: boolean;
		branch: string | null;
		operation: GitOperation | null;
		busy: boolean;
		onSync: () => void;
		onPublish: () => void;
	};
	let { place, tracking, ahead, behind, hasCommits, detached, branch, operation, busy, onSync, onPublish }: Props = $props();

	// VS Code's tooltip for its Sync Changes button: one sentence for what it would do
	const syncTip = $derived.by(() => {
		const t = tracking ?? '';
		if (behind > 0 && ahead > 0) return m.vcs_sync_tip_both({ behind, ahead, tracking: t });
		if (behind > 0)
			return behind === 1 ? m.vcs_sync_to_receive_one({ tracking: t }) : m.vcs_sync_to_receive_count({ count: behind, tracking: t });
		if (ahead > 0) return ahead === 1 ? m.vcs_sync_to_send_one({ tracking: t }) : m.vcs_sync_to_send_count({ count: ahead, tracking: t });
		return m.vcs_sync_tip();
	});
	const publishable = $derived(!tracking && hasCommits && !detached && !!branch);
	// hidden mid merge or rebase, which git would refuse; the header says what is in progress instead
	const showSync = $derived(!!tracking && !operation && (place === 'header' || ahead > 0 || behind > 0));
	const showPublish = $derived(publishable && !operation);
	const syncing = $derived(gitRunning.current === 'sync');
	const publishing = $derived(gitRunning.current === 'publish');
	// the Refresh button's own box, widened to its contents, so the row's hovers are one height
	const HEADER = 'btn-icon btn-icon-xs w-auto gap-1 px-1 hover:preset-tonal';
	// header widths below which the word goes, measured per language in the app (Synchronisieren is four times Sync)
	const HEADER_WORD: Record<Locale, { sync: string; publish: string }> = {
		en: { sync: '@max-[12rem]:hidden', publish: '@max-[13rem]:hidden' },
		de: { sync: '@max-[16.5rem]:hidden', publish: '@max-[16.5rem]:hidden' },
		'pt-BR': { sync: '@max-[14.5rem]:hidden', publish: '@max-[13.5rem]:hidden' },
		'zh-Hans': { sync: '@max-[12rem]:hidden', publish: '@max-[10.5rem]:hidden' },
		'zh-Hant': { sync: '@max-[13.5rem]:hidden', publish: '@max-[10.5rem]:hidden' }
	};
	const word = HEADER_WORD[getLocale()];
	// narrower still, the icon goes too when there are counts: their arrows say it
	const iconFit = $derived(ahead > 0 || behind > 0 ? '@max-[9rem]:hidden' : '');
	const ACTION = 'btn btn-xs preset-filled-primary-500 w-full gap-1.5 whitespace-normal';
	const ACTION_LABEL = 'cap-center min-w-0 overflow-x-clip text-ellipsis';
</script>

{#snippet counts(size: string)}
	{#if behind > 0}<span class="flex items-center tabular-nums"><ArrowDown class={size} /><span class="cap-center">{behind}</span></span
		>{/if}
	{#if ahead > 0}<span class="flex items-center tabular-nums"><ArrowUp class={size} /><span class="cap-center">{ahead}</span></span>{/if}
{/snippet}

{#if showSync && place === 'header'}
	<!-- VS Code's two states. With an upstream: Sync, carrying what it would take in and send.
	     `ahead` is counted from local refs and is exact; `behind` is as of the last fetch, which Sync
	     itself runs, and the tooltip says so. Without one: Publish, once there is a version to
	     publish and a branch to publish it from. -->
	<button
		class={HEADER}
		use:tip={syncing ? m.vcs_running_sync() : syncTip}
		aria-label={m.vcs_sync_aria()}
		onclick={onSync}
		disabled={busy || !!operation}
	>
		{#if syncing}<LoaderCircle class="size-3.5 animate-spin" />{:else}<ArrowDownUp class="size-3.5 {iconFit}" />{/if}
		<span class="cap-center {word.sync}">{m.vcs_sync_button()}</span>
		{#if !syncing}{@render counts('size-3')}{/if}
	</button>
{:else if showSync}
	<!-- narrow, the name shortens to Sync and then the icon goes, so the counts keep their room -->
	<div class="@container px-2">
		<button class={ACTION} onclick={onSync} disabled={busy} use:tip={syncTip}>
			{#if syncing}
				<LoaderCircle class="size-3.5 shrink-0 animate-spin" />
				<span class={ACTION_LABEL}>{m.vcs_running_sync()}</span>
			{:else}
				<ArrowDownUp class="size-3.5 shrink-0 @max-[7.5rem]:hidden" />
				<span class="{ACTION_LABEL} @max-[12rem]:hidden">{m.vcs_action_sync()}</span>
				<span class="{ACTION_LABEL} hidden @max-[12rem]:block">{m.vcs_sync_button()}</span>
				{@render counts('size-3')}
			{/if}
		</button>
	</div>
{:else if showPublish && place === 'header'}
	<button
		class={HEADER}
		use:tip={publishing ? m.vcs_running_publish() : m.vcs_publish_button_tip()}
		aria-label={publishing ? m.vcs_running_publish() : m.vcs_publish_button()}
		onclick={onPublish}
		disabled={busy}
	>
		<!-- running, only the icon turns: Publishing Branch… would not fit the room measured for the word -->
		{#if publishing}<LoaderCircle class="size-3.5 animate-spin" />{:else}<CloudUpload class="size-3.5" />{/if}
		<span class="cap-center {word.publish}">{m.vcs_publish_button()}</span>
	</button>
{:else if showPublish}
	<div class="px-2">
		<button class={ACTION} use:tip={m.vcs_publish_dialog_title({ branch: branch ?? '' })} onclick={onPublish} disabled={busy}>
			{#if publishing}<LoaderCircle class="size-3.5 shrink-0 animate-spin" />{:else}<CloudUpload class="size-3.5 shrink-0" />{/if}
			<span class={ACTION_LABEL}>{publishing ? m.vcs_running_publish() : m.vcs_action_publish()}</span>
		</button>
	</div>
{/if}
