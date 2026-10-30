<script lang="ts">
	import { ChevronDown, ChevronRight, CircleAlert, TriangleAlert } from '@lucide/svelte';
	import type { FigureEditorState } from '../../state/editorState.svelte';
	import { tip } from '../../ui/tooltip';
	import { problemRows, type ProblemRow } from './problemRows';

	type Props = { editor: FigureEditorState };
	const props: Props = $props();

	const rows = $derived(problemRows(props.editor));
	const errors = $derived(rows.filter((r) => r.level === 'error').length);
	const panes = $derived(props.editor.panes);
	// shut until there is something in it, as Texpile's dock opens on a failed compile
	const open = $derived(panes.problemsShut === null ? rows.length > 0 : !panes.problemsShut);

	function jump(row: ProblemRow) {
		if (row.statement) props.editor.select(row.statement);
		else if (row.line) props.editor.code.revealLine(row.line);
	}
</script>

<section class="border-surface-200-800 flex shrink-0 flex-col border-t text-xs" aria-label="Problems">
	<!-- the WAI-ARIA window splitter; svelte's a11y rule does not know it -->
	<!-- svelte-ignore a11y_no_noninteractive_tabindex, a11y_no_noninteractive_element_interactions -->
	<div
		class="hover:bg-primary-wash active:bg-primary-flood relative z-20 -my-[3px] h-1.5 shrink-0 cursor-row-resize bg-transparent transition-colors"
		onmousedown={(e) => panes.startProblemsResize(e, open)}
		onkeydown={(e) => panes.resizeProblemsByKey(e, open)}
		ondblclick={panes.resetProblemsHeight}
		role="separator"
		aria-orientation="horizontal"
		aria-label="Problems height"
		tabindex="0"
	></div>
	<button
		class="hover:preset-tonal flex h-8 shrink-0 items-center gap-1.5 px-2 text-left"
		aria-expanded={open}
		onclick={() => (panes.problemsShut = open)}
	>
		{#if open}<ChevronDown class="size-3.5 shrink-0" />{:else}<ChevronRight class="size-3.5 shrink-0" />{/if}
		<span class="cap-center font-semibold">Problems</span>
		{#if rows.length}
			<span
				class="{errors
					? 'bg-error-500 text-error-contrast-500'
					: 'bg-warning-500 text-warning-contrast-500'} min-w-3.5 self-center rounded-full px-0.5 text-center text-[9px] leading-3.5 font-semibold tabular-nums"
				>{rows.length > 99 ? '99+' : rows.length}</span
			>
		{/if}
	</button>
	{#if open}
		<div class="min-h-0 overflow-y-auto pb-1 [scrollbar-gutter:stable]" style:height="{panes.problemsHeight}px">
			{#each rows as row, n (n)}
				{@const reachable = row.statement !== null || row.line !== null}
				<button
					class="flex w-full items-start gap-2 px-2 py-1.5 text-left {reachable ? 'hover:preset-tonal' : 'cursor-default'}"
					onclick={() => jump(row)}
				>
					{#if row.level === 'error'}
						<CircleAlert class="text-error-ink mt-0.5 size-3.5 shrink-0" />
					{:else}
						<TriangleAlert class="text-warning-ink mt-0.5 size-3.5 shrink-0" />
					{/if}
					<span class="min-w-0 flex-1">
						<span class="block truncate" use:tip={row.message}>{row.message}</span>
						{#if row.hint}<span class="text-muted block truncate" use:tip={row.hint}>{row.hint}</span>{/if}
					</span>
					{#if row.line !== null}<span class="text-muted shrink-0 font-mono">line {row.line}</span>{/if}
				</button>
			{:else}
				<p class="text-muted px-3 py-2">No problems. {props.editor.language.engineName} draws the picture as it is written.</p>
			{/each}
		</div>
	{/if}
</section>
