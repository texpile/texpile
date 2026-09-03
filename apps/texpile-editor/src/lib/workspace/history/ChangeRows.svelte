<script lang="ts">
	// One tick box per changed file. Quiet by design: almost everything is included, so a column of
	// saturated ticks would be the loudest thing in the panel while saying the least. The control
	// picks up the accent on hover and focus, where it means something.
	import { tip } from '$lib/components/tooltip.svelte';
	import { Info, MoreHorizontal, Undo2, Trash2, GitCompare } from '@lucide/svelte';
	import { Popover, Portal } from '@skeletonlabs/skeleton-svelte';
	import { isTexpileManaged } from '$lib/comments/managed';
	import { STATUS_COLOR, STATUS_TITLE } from '$lib/filetree/treeBadges';
	import { badgeOf } from '$lib/workspace/gitStore';
	import type { GitStatusEntry } from '$lib/workspace/git';
	import { m } from '$lib/paraglide/messages';

	type Props = {
		changes: GitStatusEntry[];
		selected: string[];
		relPath: (p: string) => string;
		baseName: (p: string) => string;
		dirName: (p: string) => string;
		onToggle: (path: string) => void;
		onOpenDiff: (path: string) => void;
		onDiscard: (changes: GitStatusEntry[]) => void;
	};
	let { changes, selected, relPath, baseName, dirName, onToggle, onOpenDiff, onDiscard }: Props = $props();

	let openMenu = $state<string | null>(null);

	/** untracked files have no committed copy, so discarding one deletes it rather than reverting it */
	function isUntracked(c: GitStatusEntry) {
		return c.x === '?';
	}
</script>

{#each changes as c (c.path)}
	{@const badge = badgeOf(c.x, c.y)}
	<div class="group hover:bg-surface-200-800 flex items-center gap-2 rounded-base px-2 py-0.5 text-sm">
		<input
			type="checkbox"
			class="checkbox border-surface-400-600 accent-primary-500 size-3.5 shrink-0 opacity-70 transition-opacity group-hover:opacity-100"
			checked={selected.includes(c.path)}
			onchange={() => onToggle(c.path)}
			aria-label={relPath(c.path)}
		/>
		<button class="flex min-w-0 flex-1 items-center gap-1.5 text-left" onclick={() => onOpenDiff(c.path)} use:tip={relPath(c.path)}>
			<span class="truncate {STATUS_COLOR[badge]}" use:tip={STATUS_TITLE[badge]}>{baseName(c.path)}</span>
			{#if dirName(c.path)}<span class="text-muted truncate text-xs">{dirName(c.path)}</span>{/if}
			<!-- .texpile is hidden from the file tree, so this is the first place anyone meets the
			     file. Unexplained, it reads as junk to discard rather than review notes to keep. -->
			{#if isTexpileManaged(relPath(c.path))}
				<span class="badge preset-tonal-primary shrink-0 gap-1 px-1 py-0 text-[10px]" use:tip={m.texpile_managed_note()}>
					<Info class="size-3" />
					{m.vcs_texpile_managed()}
				</span>
			{/if}
		</button>

		<!-- one slot, and discard lives inside it rather than beside the row: it is the only action
		     here that git cannot give back, so it does not sit a hover away from a harmless one -->
		<Popover
			open={openMenu === c.path}
			onOpenChange={(e) => (openMenu = e.open ? c.path : null)}
			positioning={{ placement: 'bottom-end', offset: { mainAxis: 2 } }}
			autoFocus={false}
		>
			<Popover.Trigger
				class="hover:preset-tonal shrink-0 rounded-base p-0.5 opacity-0 group-hover:opacity-100 {openMenu === c.path ? 'opacity-100' : ''}"
				aria-label={m.vcs_row_actions()}
			>
				{#snippet element(attrs)}
					<button {...attrs} use:tip={m.vcs_row_actions()}><MoreHorizontal class="size-3.5" /></button>
				{/snippet}
			</Popover.Trigger>
			<Portal>
				<Popover.Positioner class="z-floating-ui">
					<Popover.Content class="card bg-surface-50-950 border-surface-300-700 min-w-[190px] border shadow-lg">
						<div class="py-1">
							<button
								type="button"
								class="hover:preset-tonal-primary flex w-full items-center gap-2 px-3 py-1.5 text-left text-sm"
								onclick={() => {
									openMenu = null;
									onOpenDiff(c.path);
								}}
							>
								<GitCompare class="size-4 shrink-0" />
								{m.wsview_diff_heading()}
							</button>
							<div class="border-surface-200-800 my-1 border-t"></div>
							<button
								type="button"
								class="hover:preset-tonal-error text-error-500 flex w-full items-center gap-2 px-3 py-1.5 text-left text-sm"
								onclick={() => {
									openMenu = null;
									onDiscard([c]);
								}}
							>
								{#if isUntracked(c)}
									<Trash2 class="size-4 shrink-0" />
									{m.vcs_delete_untracked()}
								{:else}
									<Undo2 class="size-4 shrink-0" />
									{m.vcs_discard_changes()}
								{/if}
							</button>
						</div>
					</Popover.Content>
				</Popover.Positioner>
			</Portal>
		</Popover>
	</div>
{/each}
