<script lang="ts">
	import { tip } from '$lib/components/tooltip.svelte';
	import { CircleAlert, TriangleAlert, Box, FileCheck2, Info } from '@lucide/svelte';
	import { compileLog, resolveLogPath } from '$lib/stores/compileLogStore';
	import { mainFile, effectiveCompileFormat } from '$lib/workspace/workspaceStore';
	import type { LogEntry } from '$lib/compileLog/compileLog';
	import { m } from '$lib/paraglide/messages';

	// root is the workspace root used to resolve TeX-printed relative paths
	let { root, onJump }: { root: string; onJump: (file: string, line: number) => void } = $props();

	let showBadboxes = $state(false);

	const log = $derived(compileLog.current);
	const rows = $derived(log ? [...log.errors, ...log.warnings, ...(showBadboxes ? log.badboxes : [])] : []);

	function target(e: LogEntry): { file: string; line: number } | null {
		const file = resolveLogPath(root, e.file);
		return file ? { file, line: e.line ?? 1 } : null;
	}
	function shortPath(e: LogEntry): string {
		if (!e.file) return '';
		const f = e.file.replace(/\\/g, '/');
		// keep workspace-relative paths short; foreign (installation) paths keep their tail
		return f.startsWith('./') ? f.slice(2) : f.split('/').slice(-2).join('/');
	}
</script>

<div class="flex h-full min-h-0 flex-col text-xs">
	{#if !log}
		<div class="text-muted flex flex-1 items-center justify-center gap-2 p-4">
			<Info class="size-4" />
			{effectiveCompileFormat(mainFile.current) === 'typst' ? m.problems_empty_state_typst() : m.problems_empty_state()}
		</div>
	{:else}
		<div class="border-surface-200-800 flex h-7 shrink-0 items-center gap-3 border-b px-2">
			{#if log.status.fatal || (log.errors.length > 0 && log.status.pages === undefined)}
				<span class="text-error-ink flex items-center gap-1 font-medium">
					<CircleAlert class="size-3.5" />
					{log.status.fatal ? m.problems_status_failed_no_pdf() : m.problems_status_failed()}
				</span>
			{:else if log.errors.length === 0 && log.warnings.length === 0}
				<span class="text-success-ink flex items-center gap-1 font-medium">
					<FileCheck2 class="size-3.5" />
					{m.problems_status_clean()}{log.status.pages
						? ` (${
								log.status.pages === 1
									? m.problems_page_count_one({ count: log.status.pages })
									: m.problems_page_count_other({ count: log.status.pages })
							})`
						: ''}
				</span>
			{:else}
				<span class="text-muted">
					{log.errors.length === 1
						? m.problems_error_count_one({ count: log.errors.length })
						: m.problems_error_count_other({ count: log.errors.length })}, {log.warnings.length === 1
						? m.problems_warning_count_one({ count: log.warnings.length })
						: m.problems_warning_count_other({ count: log.warnings.length })}{log.status.pages
						? ` (${
								log.status.pages === 1
									? m.problems_page_count_one({ count: log.status.pages })
									: m.problems_page_count_other({ count: log.status.pages })
							})`
						: ''}
				</span>
			{/if}
			<label class="text-muted ml-auto flex cursor-pointer items-center gap-1.5">
				<input type="checkbox" class="checkbox scale-75" bind:checked={showBadboxes} />
				{m.problems_boxes_count({ count: log.badboxes.length })}
			</label>
		</div>
		<div class="min-h-0 flex-1 overflow-y-auto">
			{#if rows.length === 0}
				<!-- no icon: the header row above already carries the check next to "Compiled clean" -->
				<div class="text-muted p-4">
					{m.problems_no_problems()}
				</div>
			{:else}
				{#each rows as e, i (i)}
					{@const t = target(e)}
					<button
						class="flex w-full items-start gap-2 px-2 py-1.5 text-left {t
							? 'hover:bg-surface-200-800 cursor-pointer'
							: 'cursor-default opacity-60'}"
						onclick={() => t && onJump(t.file, t.line)}
					>
						{#if e.level === 'error'}
							<CircleAlert class="text-error-ink mt-0.5 size-3.5 shrink-0" />
						{:else if e.level === 'warning'}
							<TriangleAlert class="text-warning-ink mt-0.5 size-3.5 shrink-0" />
						{:else}
							<Box class="text-faint mt-0.5 size-3.5 shrink-0" />
						{/if}
						<span class="min-w-0 flex-1">
							<span class="block truncate" use:tip={e.message}>{e.message}</span>
							{#if e.hint}
								<span class="text-muted block truncate" use:tip={e.hint}>{e.hint}</span>
							{/if}
						</span>
						{#if e.source}
							<span class="badge preset-tonal-surface shrink-0 px-1 py-0 text-[10px]">{e.source}</span>
						{/if}
						{#if e.file}
							<span class="text-muted shrink-0 font-mono">
								{shortPath(e)}{e.line ? `:${e.line}` : ''}
							</span>
						{:else if e.page}
							<span class="text-muted shrink-0 font-mono">{m.problems_page_ref({ page: e.page })}</span>
						{/if}
					</button>
				{/each}
			{/if}
		</div>
	{/if}
</div>
