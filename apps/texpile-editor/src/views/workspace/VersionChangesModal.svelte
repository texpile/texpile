<script lang="ts">
	// What one version changed, against the version before it: its files down the side and the
	// chosen one's difference beside them, like a commit on GitHub. Read-only; History's own rows
	// answer the other question, what differs from that version now.
	import { onMount } from 'svelte';
	import { Columns2, Rows2, FileDiff } from '@lucide/svelte';
	import { tip } from '$lib/components/tooltip.svelte';
	import Modal from '$lib/modals/Modal.svelte';
	import FileIcon from '$lib/filetree/FileIcon.svelte';
	import { STATUS_COLOR, STATUS_DECOR, STATUS_TITLE } from '$lib/filetree/treeBadges';
	import { pathLabels } from '$lib/workspace/scm/ui/changes/pathLabels';
	import { gitChangesIn, gitFileAt } from '$lib/workspace/scm/gitVersion';
	import { closeVersionChanges } from '$lib/workspace/versionChanges.svelte';
	import { layout as savedLayout } from '$lib/storage/layout';
	import type { GitFileChange, GitLogEntry } from '$lib/workspace/scm/git';
	import DiffPanel from './diff/DiffPanel.svelte';
	import { m } from '$lib/paraglide/messages';

	let { entry, root }: { entry: GitLogEntry; root: string } = $props();

	const labels = $derived(pathLabels(root));
	let files = $state<GitFileChange[]>([]);
	let parent = $state<string | null>(null);
	let listing = $state(true);
	let error = $state<string | null>(null);
	let picked = $state<GitFileChange | null>(null);
	let before = $state('');
	let after = $state('');
	let binary = $state(false);
	let reading = $state(false);
	let diffLayout = $state<'unified' | 'split'>(savedLayout.current.diffLayout === 'split' ? 'split' : 'unified');
	let seq = 0;

	onMount(async () => {
		const res = await gitChangesIn(root, entry.hash);
		listing = false;
		if (!res.ok) {
			error = res.error ?? m.vcs_version_changes_failed();
			return;
		}
		files = res.entries ?? [];
		parent = res.parent ?? null;
		if (files[0]) void pick(files[0]);
	});

	/** both sides of one file: nothing on the side where it did not exist */
	async function pick(f: GitFileChange) {
		picked = f;
		const mine = ++seq;
		reading = true;
		const [a, b] = await Promise.all([
			f.status === 'A' || !parent ? null : gitFileAt(root, f.from ?? f.path, parent),
			f.status === 'D' ? null : gitFileAt(root, f.path, entry.hash)
		]);
		if (mine !== seq) return;
		before = a?.content ?? '';
		after = b?.content ?? '';
		// an image or a PDF: a line diff of its bytes says nothing
		binary = before.includes('\0') || after.includes('\0');
		reading = false;
	}

	function when(iso: string): string {
		const d = new Date(iso);
		return Number.isFinite(d.getTime()) ? d.toLocaleString() : iso;
	}
</script>

<Modal
	title={entry.subject}
	icon={FileDiff}
	card="flex h-[85vh] w-[min(1100px,94vw)] max-w-none flex-col p-4"
	onClose={closeVersionChanges}
>
	<p class="text-muted -mt-2 mb-3 truncate text-xs">
		{entry.author} · {when(entry.date)} · <span class="font-mono">{entry.short}</span>
		{#if entry.parentCount > 1}· {m.vcs_version_changes_merge()}{/if}
	</p>

	{#if listing}
		<p class="text-muted text-sm">{m.vcs_loading_changes()}</p>
	{:else if error}
		<p class="text-error-ink text-sm" role="alert">{error}</p>
	{:else if files.length === 0}
		<p class="text-muted text-sm">{m.vcs_version_changes_none()}</p>
	{:else}
		<div class="flex min-h-0 flex-1 gap-3">
			<ul class="border-surface-200-800 w-60 shrink-0 overflow-y-auto rounded-base border py-1" aria-label={m.vcs_version_changes_files()}>
				{#each files as f (f.path)}
					<li>
						<button
							class="hover:preset-tonal flex w-full items-center gap-1.5 px-2 py-0.5 text-left text-sm {picked === f
								? 'bg-surface-200-800'
								: ''}"
							onclick={() => pick(f)}
							use:tip={f.from ? `${labels.relPath(f.from)} → ${labels.relPath(f.path)}` : labels.relPath(f.path)}
						>
							<FileIcon name={labels.baseName(f.path)} class="size-4 shrink-0" />
							<span class="truncate {STATUS_COLOR[f.status]} {STATUS_DECOR[f.status] ?? ''}" use:tip={STATUS_TITLE[f.status]}
								>{labels.baseName(f.path)}</span
							>
							{#if labels.dirName(f.path)}<span class="text-muted truncate text-xs">{labels.dirName(f.path)}</span>{/if}
						</button>
					</li>
				{/each}
			</ul>

			<div class="border-surface-200-800 flex min-w-0 flex-1 flex-col overflow-hidden rounded-base border">
				<div class="bg-surface-100-900 border-surface-200-800 text-muted flex min-h-8 shrink-0 items-center gap-2 border-b px-3 text-xs">
					<span class="min-w-0 truncate">{picked ? labels.relPath(picked.path) : ''}</span>
					<button
						class="btn-icon btn-icon-xs hover:preset-tonal ml-auto"
						onclick={() => (diffLayout = diffLayout === 'split' ? 'unified' : 'split')}
						use:tip={diffLayout === 'unified' ? m.wsview_switch_to_side_by_side() : m.wsview_switch_to_inline()}
						aria-label={diffLayout === 'unified' ? m.wsview_side_by_side_label() : m.wsview_inline_label()}
					>
						{#if diffLayout === 'split'}<Rows2 class="size-3.5" />{:else}<Columns2 class="size-3.5" />{/if}
					</button>
				</div>
				<div class="min-h-0 flex-1">
					{#if reading}
						<p class="text-muted p-3 text-sm">{m.vcs_loading_changes()}</p>
					{:else if binary}
						<p class="text-muted p-3 text-sm">{m.vcs_version_changes_binary()}</p>
					{:else if picked}
						{#key picked.path}
							<DiffPanel filename={picked.path} original={before} modified={after} layout={diffLayout} readOnly />
						{/key}
					{/if}
				</div>
			</div>
		</div>
	{/if}
</Modal>
