<script lang="ts">
	// A version opens to what differs between it and the working copy NOW - deliberately not what
	// that version changed, which a commit graph lists. Those answer different questions, and this
	// is the one standing next to Restore. Shaped after VS Code's Source Control Graph.
	import { tip } from '$lib/components/tooltip.svelte';
	import { onDestroy } from 'svelte';
	import { GitCommitHorizontal, GitBranch, TriangleAlert, MoreHorizontal, History } from '@lucide/svelte';
	import { Popover, Portal } from '@skeletonlabs/skeleton-svelte';
	import GraphRail from './GraphRail.svelte';
	import FileIcon from '$lib/filetree/FileIcon.svelte';
	import { STATUS_COLOR, STATUS_TITLE } from '$lib/filetree/treeBadges';
	import type { GitLogEntry, GitFileChange } from '$lib/workspace/git';
	import { m } from '$lib/paraglide/messages';

	type Props = {
		history: GitLogEntry[];
		busy: boolean;
		/** marked against the newest version, the way VS Code marks HEAD */
		branch?: string | null;
		/** a broken read, as against an unsaved project */
		error?: string | null;
		/** the last row is not the project's first version */
		hasMore?: boolean;
		onShowMore?: () => void;
		/** read when the version is opened */
		onLoadChanges: (hash: string) => Promise<GitFileChange[]>;
		/** open that file as it was in this version */
		onCompare: (entry: GitLogEntry, path: string) => void;
		onRestore: (entry: GitLogEntry) => void;
		baseName: (p: string) => string;
		dirName: (p: string) => string;
	};
	let {
		history,
		busy,
		branch = null,
		error = null,
		hasMore = false,
		onShowMore,
		onLoadChanges,
		onCompare,
		onRestore,
		baseName,
		dirName
	}: Props = $props();

	// one at a time: two "what differs from now" lists side by side read as a difference between
	// the two versions, which is not what either says
	let expanded = $state<string | null>(null);
	let changes = $state<GitFileChange[]>([]);
	let loading = $state(false);
	let openMenu = $state<string | null>(null);

	// clicked and still being read, which is not the same as open. Deliberately not $state: the
	// markup must not react to it, or the row starts opening again.
	let opening: string | null = null;
	let slow: ReturnType<typeof setTimeout> | undefined;

	/** Opens ALREADY FILLED. The read is usually a few ms, and expanding to a bare lane and then
	 *  appending the rows a frame later reads as a twitch - the rail's own length changes with them.
	 *  Past 300ms, the editor's threshold for showing anything at all, the row opens on its own so a
	 *  slow read still answers the click. */
	async function toggle(hash: string) {
		if (expanded === hash || opening === hash) {
			clearTimeout(slow);
			if (expanded === hash) expanded = null;
			opening = null;
			return;
		}
		opening = hash;
		slow = setTimeout(() => {
			if (opening !== hash) return;
			expanded = hash;
			changes = [];
			loading = true;
		}, 300);
		const got = await onLoadChanges(hash);
		// a second version may have been opened while this was in flight; that one owns the list now
		if (opening !== hash) return;
		clearTimeout(slow);
		opening = null;
		expanded = hash;
		changes = got;
		loading = false;
	}

	onDestroy(() => clearTimeout(slow));

	/** coarse on purpose: "3 days ago" is what a writer wants, an exact timestamp is on the title */
	function ago(iso: string): string {
		const then = new Date(iso).getTime();
		if (!Number.isFinite(then)) return '';
		const mins = Math.round((Date.now() - then) / 60000);
		if (mins < 1) return m.vcs_ago_now();
		if (mins < 60) return m.vcs_ago_minutes({ count: mins });
		const hours = Math.round(mins / 60);
		if (hours < 24) return m.vcs_ago_hours({ count: hours });
		const days = Math.round(hours / 24);
		if (days < 7) return m.vcs_ago_days({ count: days });
		return new Date(iso).toLocaleDateString();
	}

	function exact(iso: string): string {
		const d = new Date(iso);
		return Number.isFinite(d.getTime()) ? d.toLocaleString() : iso;
	}
</script>

{#if error && history.length === 0}
	<!-- an empty timeline used to mean both "nothing saved yet" and "the read failed", and the
	     reassuring reading won: a log that never once succeeded looked like a fresh project -->
	<div class="text-surface-500 mt-6 flex flex-col items-center gap-1 px-3 text-center text-sm">
		<TriangleAlert class="text-warning-500 size-6" />
		{m.vcs_history_error()}
		<span class="text-surface-600-400 text-xs break-words">{error}</span>
	</div>
{:else if history.length === 0}
	<div class="text-surface-500 mt-6 flex flex-col items-center gap-1 text-center text-sm">
		<GitCommitHorizontal class="size-6 opacity-60" />
		{m.vcs_no_history()}
	</div>
{:else}
	{#each history as entry, i (entry.hash)}
		{@const isOpen = expanded === entry.hash}
		<!-- "last" means the lane ends here, so a Show-older row below keeps it running -->
		{@const isLast = i === history.length - 1 && !hasMore}
		{@const rows = isOpen ? (loading ? 1 : changes.length) : 0}
		<div class="group hover:bg-surface-200-800 flex h-[22px] items-center pr-1">
			<GraphRail above={i > 0} below={!isLast || rows > 0} node={i === 0 ? 'head' : 'version'} merge={entry.parentCount > 1} />
			<button
				class="flex h-full min-w-0 flex-1 items-center gap-1.5 text-left"
				onclick={() => toggle(entry.hash)}
				use:tip={`${entry.subject}\n${entry.author} - ${exact(entry.date)}${entry.parentCount > 1 ? `\n$${m.vcs_merged_version()}` : ''}`}
			>
				<span class="truncate text-sm {i === 0 ? 'font-semibold' : ''}">{entry.subject}</span>
				<span class="text-surface-500 truncate text-xs">{entry.author} · {ago(entry.date)}</span>
				{#if i === 0 && branch}
					<!-- VS Code marks the checked-out branch against the newest item; here it also answers
					     "is the version I am looking at the one the editor is showing" -->
					<span class="badge preset-tonal-primary ml-auto shrink-0 gap-1 px-1.5 py-0 text-[10px]">
						<GitBranch class="size-3" />
						{branch}
					</span>
				{/if}
			</button>

			<!-- Restore lives behind the row's own menu, revealed on hover, rather than in a strip of
			     buttons under an expanded version: it is the one action here that rewrites files. -->
			<Popover
				open={openMenu === entry.hash}
				onOpenChange={(e) => (openMenu = e.open ? entry.hash : null)}
				positioning={{ placement: 'bottom-end', offset: { mainAxis: 2 } }}
				autoFocus={false}
			>
				<Popover.Trigger
					class="hover:preset-tonal shrink-0 rounded p-0.5 opacity-0 group-hover:opacity-100 {openMenu === entry.hash ? 'opacity-100' : ''}"
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
									class="hover:preset-tonal-primary flex w-full items-center gap-2 px-3 py-1.5 text-left text-sm disabled:opacity-50"
									disabled={busy || i === 0}
									onclick={() => {
										openMenu = null;
										onRestore(entry);
									}}
								>
									<History class="size-4 shrink-0" />
									{m.vcs_restore()}
								</button>
								<div class="border-surface-200-800 my-1 border-t"></div>
								<div class="text-surface-500 px-3 py-1 font-mono text-[10px]">{entry.short}</div>
							</div>
						</Popover.Content>
					</Popover.Positioner>
				</Portal>
			</Popover>
		</div>

		{#if isOpen}
			{#if loading}
				<div class="text-surface-500 flex h-[22px] items-center text-xs">
					<GraphRail above={true} below={!isLast} />
					<span class="ml-1">{m.vcs_loading_changes()}</span>
				</div>
			{:else if changes.length === 0}
				<!-- the file that is not there: this version and the working copy agree, so restoring
				     it would change nothing. Saying so beats an empty gap under an opened row. -->
				<div class="text-surface-500 flex h-[22px] items-center text-xs">
					<GraphRail above={true} below={!isLast} />
					<span class="ml-1">{m.vcs_no_changes_since()}</span>
				</div>
			{:else}
				{#each changes as f, fi (f.path)}
					<button
						class="hover:bg-surface-200-800 flex h-[22px] w-full items-center pr-1 text-left"
						onclick={() => onCompare(entry, f.path)}
						use:tip={m.tabs_compare_title({ name: baseName(f.path), version: entry.subject })}
					>
						<!-- the lane runs past a version's files, which is what makes them read as belonging
						     to it rather than as a list that happens to sit underneath -->
						<GraphRail above={true} below={!isLast || fi < changes.length - 1} />
						<FileIcon name={baseName(f.path)} class="size-4 shrink-0" />
						<span class="ml-1.5 truncate text-sm {STATUS_COLOR[f.status]}" use:tip={STATUS_TITLE[f.status]}>{baseName(f.path)}</span>
						{#if dirName(f.path)}<span class="text-surface-500 ml-1.5 truncate text-xs">{dirName(f.path)}</span>{/if}
					</button>
				{/each}
			{/if}
		{/if}
	{/each}

	{#if hasMore}
		<!-- The list is the newest slice of a longer history, and without this row the oldest entry
		     reads as the project's first version - which makes Restore on it look like going back to
		     the beginning. The lane runs INTO this row and stops there, so the history visibly
		     continues past what is drawn. -->
		<button
			class="hover:bg-surface-200-800 text-surface-500 flex h-[22px] w-full items-center pr-1 text-left text-xs"
			onclick={onShowMore}
			disabled={busy}
		>
			<GraphRail above={true} below={false} />
			<span class="ml-1 truncate">{m.vcs_show_older_versions()}</span>
		</button>
	{/if}
{/if}
