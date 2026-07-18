<script lang="ts">
	import { CircleAlert, TriangleAlert, Box, FileCheck2, Info } from '@lucide/svelte';
	import { compileLog, resolveLogPath } from '$lib/stores/compileLogStore';
	import type { LogEntry } from '$lib/latex-log';

	// root is the workspace root used to resolve TeX-printed relative paths
	let { root, onJump }: { root: string; onJump: (file: string, line: number) => void } = $props();

	let showBadboxes = $state(false);

	const log = $derived($compileLog);
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
		<div class="text-surface-500-400 flex flex-1 items-center justify-center gap-2 p-4">
			<Info class="size-4" /> No compile yet. Problems from the LaTeX log will appear here.
		</div>
	{:else}
		<div class="border-surface-200-800 flex h-7 shrink-0 items-center gap-3 border-b px-2">
			{#if log.status.fatal || (log.errors.length > 0 && log.status.pages === undefined)}
				<span class="text-error-500 flex items-center gap-1 font-medium">
					<CircleAlert class="size-3.5" /> Compile failed{log.status.fatal ? ' (no PDF produced)' : ''}
				</span>
			{:else if log.errors.length === 0 && log.warnings.length === 0}
				<span class="text-success-600-400 flex items-center gap-1 font-medium">
					<FileCheck2 class="size-3.5" /> Compiled clean{log.status.pages
						? ` (${log.status.pages} page${log.status.pages === 1 ? '' : 's'})`
						: ''}
				</span>
			{:else}
				<span class="text-surface-600-300">
					{log.errors.length} error{log.errors.length === 1 ? '' : 's'}, {log.warnings.length} warning{log.warnings.length === 1
						? ''
						: 's'}{log.status.pages ? ` (${log.status.pages} page${log.status.pages === 1 ? '' : 's'})` : ''}
				</span>
			{/if}
			<label class="text-surface-500-400 ml-auto flex cursor-pointer items-center gap-1.5">
				<input type="checkbox" class="checkbox scale-75" bind:checked={showBadboxes} />
				Boxes ({log.badboxes.length})
			</label>
		</div>
		<div class="min-h-0 flex-1 overflow-y-auto">
			{#if rows.length === 0}
				<div class="text-surface-500-400 flex items-center gap-2 p-4">
					<FileCheck2 class="size-4" /> No problems.
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
							<CircleAlert class="text-error-500 mt-0.5 size-3.5 shrink-0" />
						{:else if e.level === 'warning'}
							<TriangleAlert class="text-warning-600-400 mt-0.5 size-3.5 shrink-0" />
						{:else}
							<Box class="text-surface-400-600 mt-0.5 size-3.5 shrink-0" />
						{/if}
						<span class="min-w-0 flex-1">
							<span class="block truncate" title={e.message}>{e.message}</span>
							{#if e.hint}
								<span class="text-surface-500-400 block truncate" title={e.hint}>{e.hint}</span>
							{/if}
						</span>
						{#if e.source}
							<span class="badge preset-tonal-surface shrink-0 px-1 py-0 text-[10px]">{e.source}</span>
						{/if}
						{#if e.file}
							<span class="text-surface-500-400 shrink-0 font-mono">
								{shortPath(e)}{e.line ? `:${e.line}` : ''}
							</span>
						{:else if e.page}
							<span class="text-surface-500-400 shrink-0 font-mono">p.{e.page}</span>
						{/if}
					</button>
				{/each}
			{/if}
		</div>
	{/if}
</div>
