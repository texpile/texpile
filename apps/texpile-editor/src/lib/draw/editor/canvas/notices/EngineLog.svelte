<script lang="ts">
	import { ChevronDown, ChevronUp, CircleAlert } from '@lucide/svelte';
	import type { FigureEditorState } from '../../state/editorState.svelte';
	import { tip } from '../../ui/tooltip';
	import { firstEngineError, firstUndrawnStatement } from './canvasNoticeTexts';

	type Props = { editor: FigureEditorState };
	const props: Props = $props();

	const ed = $derived(props.editor);
	const error = $derived(firstEngineError(ed));
	const failed = $derived(firstUndrawnStatement(ed));
	const failure = $derived(ed.render.drawing ? ed.render.failure : null);
	const headline = $derived(
		failed
			? `${ed.language.engineName} could not draw the ${failed.what}: ${error}`
			: (failure ?? (error ? `${ed.language.engineName}: ${error}` : null))
	);
	let open = $state(false);
</script>

<!-- what went wrong, in a line; the log under it on asking -->
{#if headline}
	<div
		class="bg-surface-50-950 border-surface-200-800 rounded-container text-error-ink absolute right-3 bottom-3 z-20 flex max-w-[min(440px,calc(100%-1.5rem))] flex-col border text-xs shadow-lg"
		role="status"
	>
		{#if open}
			<ol class="text-surface-950-50 border-surface-200-800 max-h-44 overflow-y-auto border-b px-3 py-2 font-mono text-[11px] leading-4">
				{#each ed.render.errors as message, k (k)}
					<li class="py-0.5 break-words">
						{#if ed.render.errorLines[k] !== null}<span class="text-muted">{`line ${ed.render.errorLines[k]}: `}</span>{/if}{message}
					</li>
				{/each}
			</ol>
		{/if}
		<div class="flex min-h-9 items-center gap-2 py-1 pr-1 pl-2.5">
			<CircleAlert class="size-3.5 shrink-0" />
			<span class="cap-center min-w-0 flex-1 truncate" use:tip={headline}>{headline}</span>
			{#if failed}
				<button class="btn btn-xs preset-outlined-surface-200-800 hover:preset-tonal shrink-0" onclick={() => ed.select(failed.i)}
					>Select it</button
				>
			{/if}
			{#if ed.render.errors.length}
				<button
					class="btn btn-xs preset-outlined-surface-200-800 hover:preset-tonal text-surface-950-50 shrink-0 gap-1"
					aria-expanded={open}
					onclick={() => (open = !open)}
				>
					<span class="cap-center">{open ? 'Hide log' : 'Show log'}</span>
					{#if open}<ChevronDown class="size-3.5" />{:else}<ChevronUp class="size-3.5" />{/if}
				</button>
			{/if}
		</div>
	</div>
{/if}
