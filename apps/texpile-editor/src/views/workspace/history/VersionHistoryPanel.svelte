<script lang="ts">
	// Version History beside the editor, as Google Docs shows it: the file's copies on the right, and the
	// editor on the left marking what has changed since the one picked, in visual or source mode as it
	// is. Shown while the open tab compares the file with one of its copies; Back to Editing closes that
	// comparison.
	import { untrack } from 'svelte';
	import { History, X, Bookmark } from '@lucide/svelte';
	import { tip } from '$lib/components/tooltip.svelte';
	import {
		listLocalHistory,
		readLocalHistory,
		localHistoryRevision,
		LOCAL_REF,
		type LocalHistoryEntry
	} from '$lib/workspace/localHistory/localHistory.svelte';
	import { localHistoryActions } from '$lib/workspace/localHistory/localHistoryActions.svelte';
	import { copyStats, type CopyStats } from '$lib/workspace/localHistory/localHistoryStats';
	import { HISTORY_PANEL_WIDTH } from '$lib/workspace/paneGeometry';
	import { m } from '$lib/paraglide/messages';
	import HistoryCopyList from './HistoryCopyList.svelte';
	import { focusOnMount } from './focusOnMount';

	/** `hash`: the copy the editor compares the file with ('local:<id>') */
	let { path, hash }: { path: string; hash: string } = $props();

	const selected = $derived(hash.slice(LOCAL_REF.length));
	let entries = $state<LocalHistoryEntry[]>([]);
	let stats = $state<Map<string, CopyStats>>(new Map());
	let naming = $state(false);
	let name = $state('');
	let seq = 0;

	// read again whenever Version History changes (a rename, a delete, a restore, a save)
	$effect(() => {
		const p = path;
		void localHistoryRevision.current;
		void untrack(() => load(p));
	});

	async function load(p: string) {
		const mine = ++seq;
		const list = await listLocalHistory(p);
		const counted = await copyStats(list, (id) => readLocalHistory(p, id), (await localHistoryActions.current?.currentText(p)) ?? null);
		if (mine !== seq) return;
		entries = list;
		stats = counted;
		// the copy on screen was deleted: the newest that differs takes its place, or the editor goes back to the file
		if (list.some((e) => e.id === untrack(() => selected))) return;
		const next = list.find((e) => !counted.get(e.id)?.same) ?? list[0];
		if (next)
			localHistoryActions.current?.show(
				p,
				next,
				untrack(() => hash)
			);
		else
			localHistoryActions.current?.leave(
				p,
				untrack(() => hash)
			);
	}

	function pick(e: LocalHistoryEntry) {
		if (e.id !== selected) localHistoryActions.current?.show(path, e, hash);
	}

	async function saveNamed() {
		const n = name.trim();
		naming = false;
		name = '';
		if (n) await localHistoryActions.current?.create(path, n);
	}
</script>

<!-- its own width, never squeezed: the preview gives way instead (PaneLayout.setEditorAside) -->
<aside
	class="border-surface-200-800 bg-surface-50-950 flex shrink-0 flex-col border-l"
	style="width: {HISTORY_PANEL_WIDTH}px"
	aria-label={m.history_dialog_title()}
>
	<!-- level with the comparison's bar beside it, so the two read as one bar across the editor -->
	<div class="bg-surface-50-900 line-under flex min-h-10 shrink-0 items-center gap-2 pr-1.5 pl-3 text-xs">
		<History class="size-3.5 shrink-0" />
		<span class="cap-center font-medium">{m.history_dialog_title()}</span>
		<button
			class="btn-icon btn-icon-xs hover:preset-tonal ml-auto"
			onclick={() => localHistoryActions.current?.leave(path, hash)}
			use:tip={m.history_back()}
			aria-label={m.history_back()}
		>
			<X class="size-3.5" />
		</button>
	</div>
	<!-- what this is, for whoever opens it without knowing: it is opened rarely, and wanted badly when it is -->
	<p class="text-muted px-3 pt-2.5 pb-1 text-xs leading-relaxed">{m.history_intro()}</p>
	<HistoryCopyList {path} {entries} {stats} {selected} onPick={pick} />
	<div class="border-surface-200-800 border-t p-1">
		{#if naming}
			<input
				class="input h-7 w-full text-sm"
				placeholder={m.history_copy_name_placeholder()}
				aria-label={m.history_copy_name_placeholder()}
				bind:value={name}
				use:focusOnMount
				onkeydown={(ev) => {
					if (ev.key === 'Enter') void saveNamed();
					if (ev.key === 'Escape') {
						ev.stopPropagation();
						// emptied first: the field losing focus as it goes saves what it holds
						name = '';
						naming = false;
					}
				}}
				onblur={() => void saveNamed()}
			/>
		{:else}
			<button class="btn btn-xs hover:preset-tonal w-full justify-start gap-1.5" onclick={() => (naming = true)}>
				<Bookmark class="size-3.5" />
				<span class="cap-center">{m.history_save_copy_now()}</span>
			</button>
		{/if}
	</div>
</aside>
