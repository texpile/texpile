<script lang="ts">
	// the top bar's word count; hovering it shows the whole paper's, file by file
	import { Popover, Portal } from '@skeletonlabs/skeleton-svelte';
	import { documentCountStore as c } from '$lib/stores/countStore.svelte';
	import { tallyTotal } from '$lib/workspace/wordCount/proseWords';
	import type { ProjectWords } from '$lib/workspace/wordCount/projectWords';
	import { activeFilePath, mainFile, workspaceRoot } from '$lib/workspace/workspaceStore';
	import { basename, relativeInside, samePath } from '$lib/workspace/fileSystem';
	import { m } from '$lib/paraglide/messages';

	let { details, pickMain }: { details?: () => Promise<ProjectWords | null>; pickMain?: () => void } = $props();

	// without a main file the count starts at the open file, which may be one chapter of the paper
	const noMain = $derived(!mainFile.current && /\.(tex|typ)$/i.test(activeFilePath.current ?? ''));

	let open = $state(false);
	let result = $state<ProjectWords | null>(null);
	let failed = $state(false);
	let counting = $state(false);

	// a Markdown file shows the main file's paper, which it is no part of, so its own count goes below
	const outside = $derived(
		!!result && !!activeFilePath.current && !result.files.some((f) => samePath(f.path, activeFilePath.current ?? ''))
	);

	function fmt(n: number) {
		return n.toLocaleString();
	}

	function shown(path: string): string {
		return (workspaceRoot.current && relativeInside(workspaceRoot.current, path)) || basename(path);
	}

	// counted afresh each time it opens: the files may have changed since
	async function recount() {
		if (!details || counting) return;
		counting = true;
		failed = false;
		try {
			result = await details();
		} catch {
			failed = true;
		} finally {
			counting = false;
		}
	}

	// the wait keeps the pointer crossing the top bar from opening it; the close waits so the pointer can cross into the panel
	const HOVER_OPEN_MS = 150;
	const HOVER_CLOSE_MS = 200;
	let hoverTimer: ReturnType<typeof setTimeout> | undefined;
	let overTrigger = false;
	let escaped = false;

	function show() {
		if (open) return;
		open = true;
		void recount();
	}

	function hoverIn(e: PointerEvent) {
		if (e.pointerType === 'touch') return;
		clearTimeout(hoverTimer);
		if (!open) hoverTimer = setTimeout(show, HOVER_OPEN_MS);
	}

	function hoverOut(e: PointerEvent) {
		if (e.pointerType === 'touch') return;
		clearTimeout(hoverTimer);
		hoverTimer = setTimeout(() => (open = false), HOVER_CLOSE_MS);
	}
</script>

{#snippet summary()}
	{#if c.selectionWords != null}
		{m.wordcount_selected({ selection: fmt(c.selectionWords), total: fmt(c.words) })}
	{:else}
		{m.wordcount_words({ words: fmt(c.words) })}
	{/if}
{/snippet}

{#if details}
	<Popover
		{open}
		onOpenChange={(e) => {
			// a click on the count that hover already opened keeps it open
			if (!e.open && overTrigger && !escaped) return;
			escaped = false;
			clearTimeout(hoverTimer);
			if (e.open) show();
			else open = false;
		}}
		onEscapeKeyDown={() => (escaped = true)}
		positioning={{ placement: 'bottom-start', offset: { mainAxis: 6 } }}
		autoFocus={false}
	>
		<Popover.Trigger>
			{#snippet element(attrs)}
				<button
					{...attrs}
					type="button"
					class="text-muted hover:text-surface-950-50 rounded-base text-xs whitespace-nowrap tabular-nums select-none"
					onpointerenter={(e) => {
						overTrigger = e.pointerType !== 'touch';
						hoverIn(e);
					}}
					onpointerleave={(e) => {
						overTrigger = false;
						hoverOut(e);
					}}
				>
					{@render summary()}
				</button>
			{/snippet}
		</Popover.Trigger>
		<Portal>
			<Popover.Positioner class="z-floating-ui">
				<Popover.Content
					class="card bg-surface-50-950 border-surface-300-700 w-80 border p-3 shadow-lg"
					onpointerenter={hoverIn}
					onpointerleave={hoverOut}
				>
					{#if failed}
						<p class="text-error-ink text-xs">{m.wordcount_failed()}</p>
					{:else if !result}
						<p class="text-muted text-xs">{m.wordcount_counting()}</p>
					{:else}
						{@const characters = fmt(result.characters)}
						<p class="text-xl font-medium tabular-nums">{m.wordcount_words({ words: fmt(tallyTotal(result.total)) })}</p>
						<p class="text-muted text-xs tabular-nums">
							{result.files.length > 1 ? m.wordcount_in_paper({ characters }) : m.wordcount_characters({ characters })}
						</p>
						<ul class="border-surface-200-800 mt-3 max-h-48 overflow-y-auto border-t pt-2 text-xs tabular-nums">
							{#each result.files as f (f.path)}
								<li
									class="rounded-base flex items-baseline justify-between gap-3 px-1.5 py-1 {activeFilePath.current &&
									samePath(f.path, activeFilePath.current)
										? 'bg-primary-tint'
										: ''}"
								>
									<span class="min-w-0 truncate font-mono {f.missing ? 'text-faint' : ''}">{shown(f.path)}</span>
									<span class="shrink-0 {f.missing ? 'text-faint italic' : 'text-muted'}"
										>{f.missing ? m.wordcount_file_missing() : m.wordcount_words({ words: fmt(tallyTotal(f.words)) })}</span
									>
								</li>
							{/each}
						</ul>
						{#if outside}
							<div class="border-surface-200-800 mt-2 flex items-baseline justify-between gap-3 border-t px-1.5 pt-2 text-xs tabular-nums">
								<span class="text-muted">{m.wordcount_in_this_file()}</span>
								<span class="text-muted shrink-0">{m.wordcount_words({ words: fmt(c.words) })}</span>
							</div>
						{/if}
						{#if noMain}
							<div class="border-surface-200-800 mt-2 flex items-baseline justify-between gap-3 border-t px-1.5 pt-2 text-xs">
								<span class="text-muted">{m.wordcount_no_main()}</span>
								{#if pickMain}
									<button
										type="button"
										class="text-primary-ink shrink-0 hover:underline"
										onclick={() => {
											open = false;
											pickMain();
										}}>{m.wsview_pane_pick_main()}</button
									>
								{/if}
							</div>
						{/if}
					{/if}
				</Popover.Content>
			</Popover.Positioner>
		</Portal>
	</Popover>
{:else}
	<span class="text-muted text-xs whitespace-nowrap tabular-nums select-none">{@render summary()}</span>
{/if}
