<script lang="ts">
	// the top bar's word count; a LaTeX or Typst document's opens to the whole count by part and by file
	import { Popover, Portal } from '@skeletonlabs/skeleton-svelte';
	import { tip } from '$lib/components/tooltip.svelte';
	import { documentCountStore as c } from '$lib/stores/countStore.svelte';
	import { tallyTotal, WORD_PARTS, type WordTally } from '$lib/workspace/wordCount/proseWords';
	import type { ProjectWords } from '$lib/workspace/wordCount/projectWords';
	import { activeFilePath, workspaceRoot } from '$lib/workspace/workspaceStore';
	import { basename, relativeInside, samePath } from '$lib/workspace/fileSystem';
	import { m } from '$lib/paraglide/messages';

	let { details }: { details?: () => Promise<ProjectWords | null> } = $props();

	let open = $state(false);
	let result = $state<ProjectWords | null>(null);
	let failed = $state(false);
	let counting = $state(false);

	function fmt(n: number) {
		return n.toLocaleString();
	}

	const PART_NAME: Record<keyof WordTally, () => string> = {
		body: m.wordcount_part_body,
		headings: m.wordcount_part_headings,
		captions: m.wordcount_part_captions,
		footnotes: m.wordcount_part_footnotes,
		tables: m.wordcount_part_tables
	};

	function partsLine(t: WordTally): string {
		return WORD_PARTS.filter((p) => t[p])
			.map((p) => `${PART_NAME[p]()} ${fmt(t[p])}`)
			.join(' · ');
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

	const others = $derived(result ? result.files.length - 1 : 0);
</script>

{#snippet summary()}
	{#if c.selectionWords != null}
		{m.wordcount_selected({ selection: fmt(c.selectionWords), total: fmt(c.words) })}
	{:else}
		{m.wordcount_summary({ words: fmt(c.words), characters: fmt(c.charactersWithSpaces) })}
	{/if}
{/snippet}

{#if details}
	<Popover
		{open}
		onOpenChange={(e) => {
			open = e.open;
			if (e.open) void recount();
		}}
		positioning={{ placement: 'bottom-start', offset: { mainAxis: 6 } }}
		autoFocus={false}
	>
		<Popover.Trigger>
			{#snippet element(attrs)}
				<button
					{...attrs}
					type="button"
					class="text-muted hover:text-surface-950-50 rounded-base text-xs whitespace-nowrap tabular-nums select-none"
					use:tip={m.wordcount_open_details()}
				>
					{@render summary()}
				</button>
			{/snippet}
		</Popover.Trigger>
		<Portal>
			<Popover.Positioner class="z-floating-ui">
				<Popover.Content class="card bg-surface-50-950 border-surface-300-700 w-80 border p-3 shadow-lg">
					{#if failed}
						<p class="text-error-ink text-xs">{m.wordcount_failed()}</p>
					{:else if !result}
						<p class="text-muted text-xs">{m.wordcount_counting()}</p>
					{:else}
						{@const main = shown(result.files[0].path)}
						<p class="text-muted mb-2 text-xs">
							{others === 0
								? m.wordcount_scope_alone({ file: main })
								: others === 1
									? m.wordcount_scope_one({ file: main })
									: m.wordcount_scope_other({ file: main, count: others })}
						</p>
						<dl class="grid grid-cols-[1fr_auto] gap-x-4 gap-y-0.5 text-sm tabular-nums">
							{#each WORD_PARTS as part (part)}
								<dt class={result.total[part] ? '' : 'text-faint'}>{PART_NAME[part]()}</dt>
								<dd class="text-right {result.total[part] ? '' : 'text-faint'}">{fmt(result.total[part])}</dd>
							{/each}
							<dt class="border-surface-200-800 mt-1 border-t pt-1 font-medium">{m.wordcount_total()}</dt>
							<dd class="border-surface-200-800 mt-1 border-t pt-1 text-right font-medium">{fmt(tallyTotal(result.total))}</dd>
						</dl>
						{#if others > 0}
							<p class="text-muted mt-3 mb-1 text-xs font-semibold tracking-wide uppercase">{m.wordcount_by_file()}</p>
							<ul class="max-h-48 overflow-y-auto text-xs tabular-nums">
								{#each result.files as f (f.path)}
									<li
										class="flex items-baseline justify-between gap-3 rounded-base px-1 py-0.5 {activeFilePath.current &&
										samePath(f.path, activeFilePath.current)
											? 'bg-primary-tint'
											: ''}"
										use:tip={f.missing ? '' : partsLine(f.words)}
									>
										<span class="min-w-0 truncate font-mono {f.missing ? 'text-faint' : ''}">{shown(f.path)}</span>
										<span class="shrink-0 {f.missing ? 'text-faint italic' : ''}"
											>{f.missing ? m.wordcount_file_missing() : fmt(tallyTotal(f.words))}</span
										>
									</li>
								{/each}
							</ul>
						{/if}
						<p class="text-faint mt-3 text-xs leading-relaxed">{m.wordcount_note()}</p>
					{/if}
				</Popover.Content>
			</Popover.Positioner>
		</Portal>
	</Popover>
{:else}
	<span class="text-muted text-xs whitespace-nowrap tabular-nums select-none">{@render summary()}</span>
{/if}
