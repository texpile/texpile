<script lang="ts">
	// Local History: the copies Texpile keeps of a file as it is saved, and before anything overwrites
	// its text. Opened when it is needed rather than kept in the sidebar (writers open it rarely, and
	// badly want it when they do): from the File menu, a file's or tab's right-click menu and the
	// palette. Laid out as Overleaf's history is: the copies by day on the left, the chosen one on
	// the right with what has changed since, and Restore above it.
	//
	// Restore Deleted File opens the same dialog on the files under a folder that are gone but have
	// copies left: pick one, then a copy of it.
	import { onMount, untrack } from 'svelte';
	import { History, Columns2, Rows2, LoaderCircle, MoreHorizontal, PencilLine, Trash2, Copy, Bookmark, RotateCcw } from '@lucide/svelte';
	import { Popover, Portal } from '@skeletonlabs/skeleton-svelte';
	import { tip } from '$lib/components/tooltip.svelte';
	import Modal from '$lib/modals/Modal.svelte';
	import FileIcon from '$lib/filetree/FileIcon.svelte';
	import { toaster } from '$lib/modals/toaster-svelte';
	import { pathLabels } from '$lib/workspace/scm/ui/changes/pathLabels';
	import { MENU_CARD, MENU_ITEM, MENU_ICON, MENU_DANGER, MENU_TRIGGER, hoverAction } from '$lib/workspace/scm/ui/changes/rowMenu';
	import {
		listAllLocalHistory,
		listLocalHistory,
		readLocalHistory,
		entryBefore,
		sourceLabel,
		localHistoryRevision,
		type LocalHistoryEntry,
		type LocalHistoryFile
	} from '$lib/workspace/localHistory/localHistory.svelte';
	import { localHistoryActions } from '$lib/workspace/localHistory/localHistoryActions.svelte';
	import { closeLocalHistory, type LocalHistoryView } from '$lib/workspace/localHistory/localHistoryDialog.svelte';
	import { layout as savedLayout } from '$lib/storage/layout';
	import DiffPanel from './diff/DiffPanel.svelte';
	import { m } from '$lib/paraglide/messages';

	let { root, view }: { root: string; view: LocalHistoryView } = $props();

	const labels = $derived(pathLabels(root));

	// Restore Deleted File: the files under the folder that are gone and still have copies
	let deleted = $state<LocalHistoryFile[]>([]);
	let query = $state('');
	const shownDeleted = $derived(
		query.trim() ? deleted.filter((f) => labels.relPath(f.resource).toLowerCase().includes(query.trim().toLowerCase())) : deleted
	);

	// svelte-ignore state_referenced_locally
	let path = $state<string | null>(view.kind === 'file' ? view.path : null);
	let exists = $state(true);
	let entries = $state<LocalHistoryEntry[]>([]); // newest first
	let selected = $state<LocalHistoryEntry | null>(null);
	let loading = $state(true);
	let compareWith = $state<'now' | 'previous'>('now');
	let diffLayout = $state<'unified' | 'split'>(savedLayout.current.diffLayout === 'split' ? 'split' : 'unified');
	let original = $state('');
	let modified = $state('');
	let copyText = $state('');
	let openMenu = $state<string | null>(null);
	let renaming = $state<string | null>(null);
	let naming = $state(false);
	let name = $state('');
	let seq = 0;

	onMount(async () => {
		if (view.kind === 'deleted') {
			// asked for under the folder itself: the main process compares paths as the disk does,
			// without case on Windows and macOS, and hands back each file as it was first spelled
			deleted = (await listAllLocalHistory(view.under)).filter((f) => !f.exists);
			path = deleted[0]?.resource ?? null;
			if (!path) loading = false;
		}
	});

	// the copies, read again whenever Local History changes (a rename, a delete, a restore, a save)
	$effect(() => {
		const p = path;
		void localHistoryRevision.current;
		if (!p) return;
		void untrack(() => load(p));
	});

	async function load(p: string) {
		const mine = ++seq;
		const [list, current] = await Promise.all([listLocalHistory(p), localHistoryActions.current?.currentText(p) ?? null]);
		if (mine !== seq) return;
		entries = list;
		exists = current !== null;
		loading = false;
		const keep = selected && list.find((e) => e.id === selected!.id);
		await pick(keep ?? list[0] ?? null);
	}

	/** what the right side shows: the copy against the file now, against the copy before it, or,
	 *  for a deleted file, against nothing, every line being what Restore brings back */
	async function pick(e: LocalHistoryEntry | null) {
		const p = path;
		const mine = ++seq;
		if (!p || !e) {
			selected = null;
			return;
		}
		const previous = compareWith === 'previous' ? entryBefore(entries, e.id) : null;
		const [copy, now, before] = await Promise.all([
			readLocalHistory(p, e.id),
			exists && compareWith === 'now' ? (localHistoryActions.current?.currentText(p) ?? null) : null,
			previous ? readLocalHistory(p, previous.id) : null
		]);
		if (mine !== seq) return;
		copyText = copy ?? '';
		if (!exists) [original, modified] = ['', copyText];
		else if (compareWith === 'now') [original, modified] = [copyText, now ?? ''];
		else [original, modified] = [before ?? '', copyText];
		// last: the comparison is drawn once per copy, from the text it has when it appears
		selected = e;
	}

	function setCompare(to: 'now' | 'previous') {
		compareWith = to;
		void pick(selected);
	}

	function pickFile(f: LocalHistoryFile) {
		selected = null;
		path = f.resource;
	}

	async function restore() {
		const actions = localHistoryActions.current;
		if (!path || !selected || !actions) return;
		if (await actions.restore(path, selected)) closeLocalHistory();
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

	async function saveNamed() {
		const n = name.trim();
		naming = false;
		name = '';
		if (n && path) await localHistoryActions.current?.create(path, n);
	}

	async function saveRename(e: LocalHistoryEntry) {
		const n = name.trim();
		renaming = null;
		name = '';
		if (n && path) await localHistoryActions.current?.rename(path, e, n);
	}

	function focusOnMount(node: HTMLInputElement) {
		const t = setTimeout(() => node.select(), 0);
		return { destroy: () => clearTimeout(t) };
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

	// a copy that matches the file, or one of a deleted file: a comparison would fold every line away,
	// or paint every line as added, so the text is shown as it is
	const same = $derived(!!selected && exists && compareWith === 'now' && original === modified);
	const plain = $derived(same || (!!selected && !exists));

	const title = $derived(view.kind === 'file' ? m.history_dialog_title() : m.history_restore_deleted_title());
	const SEG = 'border-surface-300-700 inline-flex shrink-0 items-stretch overflow-hidden rounded-base border text-xs';
	function seg(on: boolean): string {
		return `px-2.5 py-1 ${on ? 'preset-filled-primary-500' : 'hover:preset-tonal'}`;
	}
</script>

{#snippet copies()}
	{#if !entries.length}
		<p class="text-muted p-2 text-sm">{m.history_none()}</p>
	{:else}
		<ul class="min-h-0 flex-1 overflow-y-auto py-1" aria-label={m.history_copies()}>
			{#each groups as g (g.day)}
				<li class="text-muted px-2 pt-2 pb-0.5 text-[11px] font-semibold tracking-wide uppercase">{g.day}</li>
				{#each g.items as e (e.id)}
					<li class="group relative flex items-center rounded-base {selected?.id === e.id ? 'bg-primary-tint' : 'hover:preset-tonal'}">
						{#if renaming === e.id}
							<input
								class="input mx-1 my-0.5 h-7 min-w-0 flex-1 text-sm"
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
							<button class="flex min-w-0 flex-1 items-center gap-2 px-2 py-1 text-left text-sm" onclick={() => pick(e)}>
								<span class="shrink-0 tabular-nums">{when(e)}</span>
								{#if isNamed(e)}
									<!-- the name the writer gave it: plain text, not a colour that reads as a link -->
									<span class="flex min-w-0 items-center gap-1 font-medium" use:tip={m.history_named_tip()}>
										<Bookmark class="text-muted size-3 shrink-0" /><span class="truncate">{e.source}</span>
									</span>
								{:else if e.source}
									<span class="text-muted min-w-0 truncate text-xs">{sourceLabel(e.source)}</span>
								{/if}
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
													if (path) void localHistoryActions.current?.remove(path, e);
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
{/snippet}

<Modal {title} icon={History} z="z-1200" card="flex h-[85vh] w-[min(1100px,94vw)] max-w-none flex-col p-4" onClose={closeLocalHistory}>
	{#if view.kind === 'file' && path}
		<p class="text-muted -mt-2 mb-3 truncate text-xs" use:tip={labels.relPath(path)}>{labels.relPath(path)}</p>
	{/if}
	{#if loading}
		<!-- nothing for the first 300ms, the app's threshold for announcing a wait -->
		<p class="text-muted reveal-late flex items-center gap-2 text-sm">
			<LoaderCircle class="size-4 shrink-0 animate-spin" />
			{m.vcs_loading_changes()}
		</p>
	{:else if view.kind === 'deleted' && !deleted.length}
		<p class="text-muted text-sm">{m.history_deleted_none()}</p>
	{:else}
		<div class="flex min-h-0 flex-1 gap-3">
			<div class="border-surface-200-800 flex w-64 shrink-0 flex-col overflow-hidden rounded-base border">
				{#if view.kind === 'deleted'}
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
										class="flex w-full items-center gap-1.5 rounded-base px-2 py-1 text-left text-sm {path === f.resource
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
				{/if}
				{@render copies()}
				{#if view.kind === 'file' && exists}
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
				{/if}
			</div>

			<div class="flex min-w-0 flex-1 flex-col gap-2">
				<div class="flex items-center gap-2">
					{#if exists}
						<span class="text-muted text-xs">{m.history_compare_with()}</span>
						<div class={SEG} role="radiogroup" aria-label={m.history_compare_with()}>
							<button
								type="button"
								role="radio"
								aria-checked={compareWith === 'now'}
								class={seg(compareWith === 'now')}
								onclick={() => setCompare('now')}
							>
								{m.history_compare_now()}
							</button>
							<button
								type="button"
								role="radio"
								aria-checked={compareWith === 'previous'}
								class={seg(compareWith === 'previous')}
								onclick={() => setCompare('previous')}
							>
								{m.history_compare_previous_copy()}
							</button>
						</div>
					{:else if path}
						<span class="text-warning-ink text-xs">{m.history_deleted_tip()}</span>
					{/if}
					<button
						class="btn-icon btn-icon-xs hover:preset-tonal ml-auto"
						onclick={() => (diffLayout = diffLayout === 'split' ? 'unified' : 'split')}
						use:tip={diffLayout === 'unified' ? m.wsview_switch_to_side_by_side() : m.wsview_switch_to_inline()}
						aria-label={diffLayout === 'unified' ? m.wsview_side_by_side_label() : m.wsview_inline_label()}
					>
						{#if diffLayout === 'split'}<Rows2 class="size-3.5" />{:else}<Columns2 class="size-3.5" />{/if}
					</button>
					<button class="btn btn-xs preset-outlined-surface-200-800 hover:preset-tonal gap-1.5" onclick={copy} disabled={!selected}>
						<Copy class="size-3.5" />
						<span class="cap-center">{m.history_copy_text()}</span>
					</button>
					<button class="btn btn-xs preset-filled-primary-500 gap-1.5" onclick={restore} disabled={!selected}>
						<RotateCcw class="size-3.5" />
						<span class="cap-center">{m.history_restore_this()}</span>
					</button>
				</div>
				<div class="border-surface-200-800 min-h-0 flex-1 overflow-hidden rounded-base border">
					{#if selected && path && plain}
						<div class="flex h-full flex-col">
							{#if same}<p class="text-muted border-surface-200-800 border-b px-3 py-1.5 text-xs">{m.history_same_as_now()}</p>{/if}
							<pre class="min-h-0 flex-1 overflow-auto p-3 font-mono text-[13px] leading-relaxed whitespace-pre-wrap">{copyText}</pre>
						</div>
					{:else if selected && path}
						{#key `${path}:${selected.id}:${compareWith}`}
							<DiffPanel filename={path} {original} {modified} layout={diffLayout} readOnly />
						{/key}
					{/if}
				</div>
			</div>
		</div>
	{/if}
</Modal>
