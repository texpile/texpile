<script lang="ts">
	// One tick box per changed file. Quiet by design: almost everything is included, so a column of
	// saturated ticks would be the loudest thing in the panel while saying the least. The control
	// picks up the accent on hover and focus, where it means something.
	import { tip } from '$lib/components/tooltip.svelte';
	import { Info, MoreHorizontal, Undo2, Trash2, GitCompare, Check, EyeOff, FolderPlus, ArrowLeft, ArrowRight } from '@lucide/svelte';
	import { scmHandlers } from '$lib/workspace/scm/actions/scmHandlers.svelte';
	import { Popover, Portal } from '@skeletonlabs/skeleton-svelte';
	import { isTexpileManaged } from '$lib/comments/managed';
	import FileIcon from '$lib/filetree/FileIcon.svelte';
	import { STATUS_COLOR, STATUS_DECOR, STATUS_TITLE } from '$lib/filetree/treeBadges';
	import { badgeOf, gitWriting, isNewFile } from '$lib/workspace/scm/gitStore';
	import { chooseNote, keepLabel } from '$lib/workspace/wholeFileChoice';
	import { MENU_CARD, MENU_ITEM, MENU_DANGER, MENU_ICON, MENU_SEPARATOR, MENU_TRIGGER, hoverAction } from './rowMenu';
	import type { GitStatusEntry } from '$lib/workspace/scm/git';
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
		/** rows that cannot be ticked (files both sides changed) */
		locked?: boolean;
		/** what clicking the row opens, when that is not the comparison */
		onOpen?: (path: string) => void;
	};
	let { changes, selected, relPath, baseName, dirName, onToggle, onOpenDiff, onDiscard, locked = false, onOpen }: Props = $props();

	let openMenu = $state<string | null>(null);

	type Side = 'mine' | 'theirs';

	/** keeping this side deletes the file: it is the side that deleted it */
	function deletes(c: GitStatusEntry, side: Side): boolean {
		return (c.choose === 'deleted-by-them' && side === 'theirs') || (c.choose === 'deleted-by-us' && side === 'mine');
	}

	/** the side that keeps the file first, as the question asks it; a delete is destructive, so last */
	function keepOrder(c: GitStatusEntry): Side[] {
		return c.choose === 'deleted-by-us' ? ['theirs', 'mine'] : ['mine', 'theirs'];
	}

	/** new files have no committed copy, so discarding one deletes it rather than reverting it */
	function isUntracked(c: GitStatusEntry) {
		return isNewFile(c);
	}
</script>

{#each changes as c (c.path)}
	{@const badge = badgeOf(c.x, c.y)}
	<div class="group hover:preset-tonal flex items-center gap-2 rounded-base px-2 py-0.5 text-sm">
		<input
			type="checkbox"
			class="checkbox border-surface-400-600 accent-primary-500 size-3.5 shrink-0 opacity-70 transition-opacity group-hover:opacity-100 disabled:opacity-40"
			checked={selected.includes(c.path)}
			onchange={() => onToggle(c.path)}
			disabled={locked}
			aria-label={relPath(c.path)}
			use:tip={selected.includes(c.path) ? m.vcs_untick_tip() : m.vcs_tick_tip()}
		/>
		<button
			class="flex min-w-0 flex-1 items-center gap-1.5 text-left"
			onclick={() => {
				// a deleted or non-text file has no places to open at: the question is which side to keep
				if (locked && c.choose) scmHandlers.current?.chooseWhole(c.path, c.choose);
				else if (!c.files) (onOpen ?? onOpenDiff)(c.path);
			}}
			use:tip={relPath(c.path)}
		>
			{#if c.files}
				<!-- a folder of new files, as one row: there is no one comparison to open -->
				<FolderPlus class="size-4 shrink-0 {STATUS_COLOR[badge]}" />
				<span class="max-w-[60%] shrink-0 truncate {STATUS_COLOR[badge]}">{baseName(c.path)}/</span>
				<span class="text-muted truncate text-xs tabular-nums">{m.vcs_folder_files({ count: c.files.toLocaleString() })}</span>
			{:else}
				<!-- the same file reads the same here as under a version in History -->
				<FileIcon name={baseName(c.path)} class="size-4 shrink-0" />
				<span
					class="truncate {STATUS_COLOR[badge]} {STATUS_DECOR[badge] ?? ''} {c.choose ? 'max-w-[60%] shrink-0' : ''}"
					use:tip={STATUS_TITLE[badge]}>{baseName(c.path)}</span
				>
			{/if}
			{#if dirName(c.path) && !c.files}<span class="text-muted truncate text-xs">{dirName(c.path)}</span>{/if}
			<!-- every marked place in it is chosen: nothing more to do here before Finish -->
			{#if locked && c.choose}
				<!-- the name keeps its room; the note gives way, its whole text in the tip -->
				<span class="text-warning-ink min-w-0 truncate text-xs" use:tip={`${chooseNote(c.choose)}. ${m.vcs_choose_tip()}`}
					>{chooseNote(c.choose)}</span
				>
			{:else if locked && c.markers === false}
				<span class="text-success-ink flex shrink-0 items-center gap-0.5 text-xs" use:tip={m.vcs_conflict_ready_tip()}>
					<Check class="size-3" />{m.vcs_conflict_ready()}
				</span>
			{/if}
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
			<Popover.Trigger class="{MENU_TRIGGER} {hoverAction(openMenu === c.path)}" aria-label={m.vcs_row_actions()}>
				{#snippet element(attrs)}
					<button {...attrs} use:tip={m.vcs_row_actions()}><MoreHorizontal class="size-3.5" /></button>
				{/snippet}
			</Popover.Trigger>
			<Portal>
				<Popover.Positioner class="z-floating-ui">
					<Popover.Content class={MENU_CARD}>
						{#if !c.files}
							<button
								type="button"
								class={MENU_ITEM}
								onclick={() => {
									openMenu = null;
									onOpenDiff(c.path);
								}}
							>
								<GitCompare class={MENU_ICON} />
								{m.wsview_diff_heading()}
							</button>
						{/if}
						<!-- the whole file one way, where there are no places to click: a figure, a PDF, a file
						     one side deleted. Mine and theirs point the two ways, so the pair is not two ticks. -->
						{#if locked && scmHandlers.current}
							{#each keepOrder(c) as side (side)}
								{@const deleting = deletes(c, side)}
								{#if deleting}<div class={MENU_SEPARATOR}></div>{/if}
								<button
									type="button"
									class="{MENU_ITEM} {deleting ? MENU_DANGER : ''}"
									disabled={gitWriting.current}
									use:tip={deleting ? undefined : side === 'mine' ? m.vcs_keep_file_mine_tip() : m.vcs_keep_file_theirs_tip()}
									onclick={() => {
										openMenu = null;
										scmHandlers.current?.keepSide(c.path, side);
									}}
								>
									{#if deleting}
										<Trash2 class="size-4 shrink-0" />
									{:else if side === 'mine'}
										<ArrowLeft class={MENU_ICON} />
									{:else}
										<ArrowRight class={MENU_ICON} />
									{/if}
									{keepLabel(c.choose, side)}
								</button>
							{/each}
						{/if}
						<!-- a big new folder only (a data dump, an environment): a writer's own file is left unticked
						     instead. A folder's line ends in a slash, so it cannot match a file of that name -->
						{#if c.x === '?' && c.files && scmHandlers.current}
							<button
								type="button"
								class={MENU_ITEM}
								disabled={gitWriting.current}
								onclick={() => {
									openMenu = null;
									scmHandlers.current?.ignore([`${c.path}/`]);
								}}
							>
								<EyeOff class={MENU_ICON} />
								{m.vcs_ignore_folder()}
							</button>
						{/if}
						<!-- git cannot put back a file it is still combining: Cancel combining does that for all of
						     them. A folder that also holds ignored files is not deleted whole: they would go too -->
						{#if !locked && !c.ignoredInside}
							<div class={MENU_SEPARATOR}></div>
							<button
								type="button"
								class="{MENU_ITEM} {MENU_DANGER}"
								disabled={gitWriting.current}
								onclick={() => {
									openMenu = null;
									onDiscard([c]);
								}}
							>
								{#if isUntracked(c)}
									<Trash2 class="size-4 shrink-0" />
									{c.files ? m.vcs_delete_folder() : m.vcs_delete_untracked()}
								{:else}
									<Undo2 class="size-4 shrink-0" />
									{m.vcs_discard_changes()}
								{/if}
							</button>
						{/if}
					</Popover.Content>
				</Popover.Positioner>
			</Portal>
		</Popover>
	</div>
{/each}
