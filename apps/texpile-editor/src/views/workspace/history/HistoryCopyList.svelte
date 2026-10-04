<script lang="ts">
	// One file's copies in Version History, by day, newest first: when each was kept, what it is (how it was
	// kept or the name it was given) and how much it changed, with Rename and Delete on each. Drawn in the
	// editor's Version History panel and in the Restore Deleted File dialog.
	import { MoreHorizontal, PencilLine, Trash2, Bookmark } from '@lucide/svelte';
	import { Popover, Portal } from '@skeletonlabs/skeleton-svelte';
	import { tip } from '$lib/components/tooltip.svelte';
	import { MENU_CARD, MENU_ITEM, MENU_ICON, MENU_DANGER, MENU_TRIGGER, hoverAction } from '$lib/workspace/scm/ui/changes/rowMenu';
	import { sourceLabel, type LocalHistoryEntry } from '$lib/workspace/localHistory/localHistory.svelte';
	import { localHistoryActions } from '$lib/workspace/localHistory/localHistoryActions.svelte';
	import type { CopyStats } from '$lib/workspace/localHistory/localHistoryStats';
	import { m } from '$lib/paraglide/messages';
	import { focusOnMount } from './focusOnMount';

	type Props = {
		path: string;
		/** newest first */
		entries: LocalHistoryEntry[];
		stats: Map<string, CopyStats>;
		selected: string | null;
		onPick: (e: LocalHistoryEntry) => void;
	};
	let { path, entries, stats, selected, onPick }: Props = $props();

	let openMenu = $state<string | null>(null);
	let renaming = $state<string | null>(null);
	let name = $state('');

	async function saveRename(e: LocalHistoryEntry) {
		const n = name.trim();
		renaming = null;
		name = '';
		if (n) await localHistoryActions.current?.rename(path, e, n);
	}

	/** under a row: how much it changed since the copy before it; nothing for the oldest, or for no words */
	function changed(e: LocalHistoryEntry): string {
		const words = stats.get(e.id)?.words;
		if (words === 'many') return m.history_many_changes();
		if (!words) return '';
		return words === 1 ? m.history_words_changed_one() : m.history_words_changed_other({ count: words });
	}

	/** "Today", "Yesterday", or the date, as the list is grouped */
	function dayLabel(ts: number): string {
		const d = new Date(ts);
		const today = new Date();
		const yesterday = new Date(today.getFullYear(), today.getMonth(), today.getDate() - 1);
		if (d.toDateString() === today.toDateString()) return m.history_today();
		if (d.toDateString() === yesterday.toDateString()) return m.history_yesterday();
		return d.toLocaleDateString(undefined, {
			weekday: 'short',
			day: 'numeric',
			month: 'short',
			...(d.getFullYear() !== today.getFullYear() ? { year: 'numeric' } : {})
		});
	}

	function clock(ts: number): string {
		return new Date(ts).toLocaleTimeString(undefined, { hour: '2-digit', minute: '2-digit' });
	}

	/** a copy that gathered saves over a few minutes reads as the span it covers */
	function when(e: LocalHistoryEntry): string {
		const from = e.started ?? e.timestamp;
		return e.timestamp - from >= 60_000 ? `${clock(from)}–${clock(e.timestamp)}` : clock(e.timestamp);
	}

	const groups = $derived.by(() => {
		const out: { day: string; items: LocalHistoryEntry[] }[] = [];
		for (const e of entries) {
			const day = dayLabel(e.timestamp);
			if (out.at(-1)?.day !== day) out.push({ day, items: [] });
			out.at(-1)!.items.push(e);
		}
		return out;
	});

	/** a name the author gave it, rather than a label Texpile wrote */
	function isNamed(e: LocalHistoryEntry): boolean {
		return !!e.source && sourceLabel(e.source) === e.source;
	}
</script>

{#if !entries.length}
	<p class="text-muted p-3 text-sm">{m.history_none()}</p>
{:else}
	<ul class="min-h-0 flex-1 overflow-y-auto p-1" aria-label={m.history_copies()}>
		{#each groups as g (g.day)}
			<li class="text-muted px-2 pt-2.5 pb-1 text-[11px] font-semibold tracking-wide uppercase">{g.day}</li>
			{#each g.items as e (e.id)}
				<li class="group rounded-base relative flex items-center {selected === e.id ? 'bg-primary-tint' : 'hover:preset-tonal'}">
					{#if renaming === e.id}
						<input
							class="input mx-1 my-1 h-7 min-w-0 flex-1 text-sm"
							bind:value={name}
							aria-label={m.history_rename()}
							use:focusOnMount
							onkeydown={(ev) => {
								if (ev.key === 'Enter') void saveRename(e);
								if (ev.key === 'Escape') {
									ev.stopPropagation();
									// emptied first: the field losing focus as it goes saves what it holds
									name = '';
									renaming = null;
								}
							}}
							onblur={() => void saveRename(e)}
						/>
					{:else}
						<button class="flex min-w-0 flex-1 flex-col items-start gap-0.5 px-2 py-1.5 text-left" onclick={() => onPick(e)}>
							<span class="flex w-full items-center gap-2 text-sm">
								<span class="shrink-0 font-medium tabular-nums">{when(e)}</span>
								{#if stats.get(e.id)?.same}
									<span class="bg-surface-200-800 text-muted rounded-base ml-auto shrink-0 px-1.5 text-[11px] leading-4 whitespace-nowrap"
										>{m.history_row_now()}</span
									>
								{/if}
							</span>
							<span class="text-muted flex w-full min-w-0 items-center gap-1 text-xs">
								{#if isNamed(e)}
									<!-- the name the writer gave it: plain text, not a color that reads as a link -->
									<span class="text-surface-950-50 flex min-w-0 items-center gap-1 font-medium" use:tip={m.history_named_tip()}>
										<Bookmark class="text-muted size-3 shrink-0" /><span class="truncate">{e.source}</span>
									</span>
								{:else}
									<span class="min-w-0 truncate">{sourceLabel(e.source)}</span>
								{/if}
								{#if changed(e)}<span class="shrink-0">· {changed(e)}</span>{/if}
							</span>
						</button>
						<Popover
							open={openMenu === e.id}
							onOpenChange={(d) => (openMenu = d.open ? e.id : null)}
							positioning={{ placement: 'bottom-end', offset: { mainAxis: 2 } }}
							autoFocus={false}
						>
							<Popover.Trigger class="{MENU_TRIGGER} {hoverAction(openMenu === e.id)} mr-1" aria-label={m.vcs_row_actions()}>
								{#snippet element(attrs)}
									<button {...attrs} use:tip={m.vcs_row_actions()}><MoreHorizontal class="size-3.5" /></button>
								{/snippet}
							</Popover.Trigger>
							<Portal>
								<Popover.Positioner class="z-1250">
									<Popover.Content class={MENU_CARD}>
										<button
											type="button"
											class={MENU_ITEM}
											onclick={() => {
												openMenu = null;
												name = isNamed(e) ? e.source! : '';
												renaming = e.id;
											}}
										>
											<PencilLine class={MENU_ICON} />
											{m.history_rename()}…
										</button>
										<button
											type="button"
											class="{MENU_ITEM} {MENU_DANGER}"
											onclick={() => {
												openMenu = null;
												void localHistoryActions.current?.remove(path, e);
											}}
										>
											<Trash2 class="size-4 shrink-0" />
											{m.history_delete()}
										</button>
									</Popover.Content>
								</Popover.Positioner>
							</Portal>
						</Popover>
					{/if}
				</li>
			{/each}
		{/each}
	</ul>
{/if}
