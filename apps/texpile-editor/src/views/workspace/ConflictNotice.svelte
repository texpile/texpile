<script lang="ts">
	// The bar over a file holding places a merge marked: how many are left to choose and how, with
	// the way from one to the next and the same choice for all of them at once; then, once none is,
	// where the merge is finished and the way back to the visual editor.
	import { tip } from '$lib/components/tooltip.svelte';
	import { GitMerge, ChevronUp, ChevronDown, ChevronsDown, ArrowLeft, ArrowRight, ArrowLeftRight } from '@lucide/svelte';
	import { Popover, Portal } from '@skeletonlabs/skeleton-svelte';
	import { sourceCmView } from '$lib/stores/editorStore';
	import { chooseAllConflicts, nextConflict, previousConflict } from '$lib/editor/source/cmConflicts';
	import type { ConflictChoice } from '$lib/workspace/scm/conflictMarkers';
	import { MENU_CARD, MENU_ITEM, MENU_ICON } from '$lib/workspace/scm/ui/changes/rowMenu';
	import { m } from '$lib/paraglide/messages';

	let { left, stray = false, onLeave }: { left: number; stray?: boolean; onLeave?: () => void } = $props();

	let allOpen = $state(false);

	function go(step: typeof nextConflict) {
		const view = sourceCmView.current;
		if (!view) return;
		step(view);
		view.focus();
	}

	/** every place settled the same way, as one undo step */
	function keepAll(choice: ConflictChoice) {
		allOpen = false;
		const view = sourceCmView.current;
		const spec = view && chooseAllConflicts(view.state, choice);
		if (!view || !spec) return;
		view.dispatch(spec);
		view.focus();
	}

	// the arrows a changed file's row menu uses for keeping a whole side: mine one way, theirs the other
	// each tooltip names VS Code's command (Accept All Current and so on)
	const ALL: [ConflictChoice, () => string, typeof ArrowLeft, () => string][] = [
		['mine', () => m.vcs_conflict_keep_all_mine(), ArrowLeft, () => m.vcs_conflict_keep_all_mine_tip()],
		['theirs', () => m.vcs_conflict_keep_all_theirs(), ArrowRight, () => m.vcs_conflict_keep_all_theirs_tip()],
		['both', () => m.vcs_conflict_keep_all_both(), ArrowLeftRight, () => m.vcs_conflict_keep_all_both_tip()]
	];
	const ICON = 'btn-icon btn-icon-xs hover:preset-tonal shrink-0';
</script>

<div
	class="border-surface-200-800 bg-surface-100-900 text-muted flex min-h-10 shrink-0 items-center gap-2 border-b px-3 text-xs"
	role="status"
>
	<GitMerge class="text-warning-ink size-3.5 shrink-0" />
	{#if left}
		<p class="min-w-0 flex-1 truncate">
			<span class="font-medium">{m.vcs_conflict_notice_title()}.</span>
			{left === 1 ? m.vcs_conflict_notice_one() : m.vcs_conflict_notice_count({ count: left })}
		</p>
		<button class={ICON} onclick={() => go(previousConflict)} use:tip={m.vcs_conflict_previous()} aria-label={m.vcs_conflict_previous()}>
			<ChevronUp class="size-3.5" />
		</button>
		<button class={ICON} onclick={() => go(nextConflict)} use:tip={m.vcs_conflict_next()} aria-label={m.vcs_conflict_next()}>
			<ChevronDown class="size-3.5" />
		</button>
		<Popover open={allOpen} onOpenChange={(e) => (allOpen = e.open)} positioning={{ placement: 'bottom-end', offset: { mainAxis: 2 } }}>
			<Popover.Trigger class="btn btn-xs preset-outlined-surface-200-800 hover:preset-tonal shrink-0 gap-1.5">
				<ChevronsDown class="size-3.5" />
				{m.vcs_conflict_keep_all()}
			</Popover.Trigger>
			<Portal>
				<Popover.Positioner class="z-floating-ui">
					<Popover.Content class={MENU_CARD}>
						{#each ALL as [choice, label, Icon, hint] (choice)}
							<button type="button" class={MENU_ITEM} onclick={() => keepAll(choice)} use:tip={hint()}>
								<Icon class={MENU_ICON} />
								{label()}
							</button>
						{/each}
					</Popover.Content>
				</Popover.Positioner>
			</Portal>
		</Popover>
	{:else if stray}
		<!-- every place chosen, but a marker line was left behind: Complete Merge would refuse it -->
		<p class="min-w-0 truncate">
			<span class="font-medium">{m.vcs_conflict_notice_title()}.</span>
			{m.vcs_conflict_notice_stray()}
		</p>
	{:else}
		<p class="min-w-0 truncate">
			<span class="font-medium">{m.vcs_conflict_notice_done_title()}.</span>
			{m.vcs_conflict_notice_done()}
		</p>
		{#if onLeave}
			<button class="btn btn-xs preset-outlined-surface-200-800 hover:preset-tonal ml-auto shrink-0" onclick={onLeave}>
				{m.vcs_conflict_back_to_visual()}
			</button>
		{/if}
	{/if}
</div>
