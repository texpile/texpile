<script lang="ts">
	// Restore Deleted File: the files under a folder that are gone but have copies left in Version History.
	// Pick one, then a copy of it, and Restore brings the file back. A file still in the project shows its
	// copies in the editor instead (VersionHistoryPanel), where they can be compared with it.
	import { onMount, untrack } from 'svelte';
	import { History, LoaderCircle, Copy, RotateCcw } from '@lucide/svelte';
	import { tip } from '$lib/components/tooltip.svelte';
	import Modal from '$lib/modals/Modal.svelte';
	import FileIcon from '$lib/filetree/FileIcon.svelte';
	import { toaster } from '$lib/modals/toaster-svelte';
	import { pathLabels } from '$lib/workspace/scm/ui/changes/pathLabels';
	import {
		listAllLocalHistory,
		listLocalHistory,
		readLocalHistory,
		localHistoryRevision,
		type LocalHistoryEntry,
		type LocalHistoryFile
	} from '$lib/workspace/localHistory/localHistory.svelte';
	import { localHistoryActions } from '$lib/workspace/localHistory/localHistoryActions.svelte';
	import { closeRestoreDeleted } from '$lib/workspace/localHistory/localHistoryDialog.svelte';
	import { copyStats, type CopyStats } from '$lib/workspace/localHistory/localHistoryStats';
	import { m } from '$lib/paraglide/messages';
	import HistoryCopyList from './HistoryCopyList.svelte';

	let { root, under }: { root: string; under: string } = $props();

	const labels = $derived(pathLabels(root));

	let deleted = $state<LocalHistoryFile[]>([]);
	let query = $state('');
	const shownDeleted = $derived(
		query.trim() ? deleted.filter((f) => labels.relPath(f.resource).toLowerCase().includes(query.trim().toLowerCase())) : deleted
	);

	let path = $state<string | null>(null);
	let entries = $state<LocalHistoryEntry[]>([]); // newest first
	let stats = $state<Map<string, CopyStats>>(new Map());
	let selected = $state<LocalHistoryEntry | null>(null);
	let copyText = $state('');
	let loading = $state(true);
	let seq = 0;

	onMount(async () => {
		// asked for under the folder itself: the main process compares paths as the disk does,
		// without case on Windows and macOS, and hands back each file as it was first spelled
		deleted = (await listAllLocalHistory(under)).filter((f) => !f.exists);
		path = deleted[0]?.resource ?? null;
		if (!path) loading = false;
	});

	// the copies, read again whenever Version History changes (a rename, a delete)
	$effect(() => {
		const p = path;
		void localHistoryRevision.current;
		if (p) void untrack(() => load(p));
	});

	async function load(p: string) {
		const mine = ++seq;
		const list = await listLocalHistory(p);
		const counted = await copyStats(list, (id) => readLocalHistory(p, id), null);
		if (mine !== seq) return;
		entries = list;
		stats = counted;
		loading = false;
		await pick((selected && list.find((e) => e.id === selected!.id)) ?? list[0] ?? null);
	}

	async function pick(e: LocalHistoryEntry | null) {
		const p = path;
		const mine = ++seq;
		const text = p && e ? await readLocalHistory(p, e.id) : null;
		if (mine !== seq) return;
		copyText = text ?? '';
		selected = e;
	}

	function pickFile(f: LocalHistoryFile) {
		selected = null;
		path = f.resource;
	}

	async function restore() {
		const actions = localHistoryActions.current;
		if (!path || !selected || !actions) return;
		if (await actions.restore(path, selected)) closeRestoreDeleted();
	}

	async function copy() {
		try {
			await navigator.clipboard.writeText(copyText);
		} catch {
			toaster.error({ title: m.ctxmenu_copy_failed_toast() });
			return;
		}
		toaster.success({ title: m.history_copied() });
	}
</script>

<Modal
	title={m.history_restore_deleted_title()}
	icon={History}
	z="z-1200"
	card="flex h-[80vh] w-[min(1000px,94vw)] max-w-none flex-col p-4"
	onClose={closeRestoreDeleted}
>
	{#if loading}
		<!-- nothing for the first 300ms, the app's threshold for announcing a wait -->
		<p class="text-muted reveal-late flex items-center gap-2 text-sm">
			<LoaderCircle class="size-4 shrink-0 animate-spin" />
			{m.vcs_loading_changes()}
		</p>
	{:else if !deleted.length}
		<p class="text-muted text-sm">{m.history_deleted_none()}</p>
	{:else}
		<div class="flex min-h-0 flex-1 gap-3">
			<div class="border-surface-200-800 rounded-base flex w-64 shrink-0 flex-col overflow-hidden border">
				<div class="border-surface-200-800 flex max-h-[40%] flex-col border-b p-1">
					<input
						class="input mb-1 h-7 text-sm"
						type="search"
						placeholder={m.history_find_search()}
						aria-label={m.history_find_search()}
						bind:value={query}
					/>
					<ul class="min-h-0 flex-1 overflow-y-auto">
						{#each shownDeleted as f (f.resource)}
							<li>
								<button
									class="rounded-base flex w-full items-center gap-1.5 px-2 py-1 text-left text-sm {path === f.resource
										? 'bg-primary-tint'
										: 'hover:preset-tonal'}"
									onclick={() => pickFile(f)}
									use:tip={labels.relPath(f.resource)}
								>
									<FileIcon name={labels.baseName(f.resource)} class="size-4 shrink-0" />
									<span class="truncate">{labels.baseName(f.resource)}</span>
									{#if labels.dirName(f.resource)}<span class="text-muted truncate text-xs">{labels.dirName(f.resource)}</span>{/if}
								</button>
							</li>
						{/each}
					</ul>
				</div>
				{#if path}
					<HistoryCopyList {path} {entries} {stats} selected={selected?.id ?? null} onPick={pick} />
				{/if}
			</div>

			<div class="flex min-w-0 flex-1 flex-col gap-2">
				<div class="flex items-center gap-2">
					<span class="text-warning-ink text-xs">{m.history_deleted_tip()}</span>
					<button class="btn btn-xs preset-outlined-surface-200-800 hover:preset-tonal ml-auto gap-1.5" onclick={copy} disabled={!selected}>
						<Copy class="size-3.5" />
						<span class="cap-center">{m.history_copy_text()}</span>
					</button>
					<button class="btn btn-xs preset-filled-primary-500 gap-1.5" onclick={restore} disabled={!selected}>
						<RotateCcw class="size-3.5" />
						<span class="cap-center">{m.history_restore_this()}</span>
					</button>
				</div>
				<!-- the copy as it is: every line of it is what Restore brings back -->
				<pre
					class="border-surface-200-800 rounded-base min-h-0 flex-1 overflow-auto border p-3 font-mono text-[13px] leading-relaxed whitespace-pre-wrap">{copyText}</pre>
			</div>
		</div>
	{/if}
</Modal>
