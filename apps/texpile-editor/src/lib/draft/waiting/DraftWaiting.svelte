<script lang="ts">
	// the wait before the first pages: the compile's steps with their times, and what TeX names as it goes
	import { Check, Loader2 } from '@lucide/svelte';
	import { m } from '$lib/paraglide/messages';
	import { basename } from '$lib/workspace/fileSystem';
	import { compileNoteKind } from './compileNotes';
	import type { CompileProgress, StartedStep } from './compileProgress.svelte';

	const props: { progress: CompileProgress; mainFile: string } = $props();
	const { started, notes, page, seconds } = $derived(props.progress);
	const drawing = $derived(started.at(-1)?.step === 'draw');

	function label(at: StartedStep): string {
		if (at.step === 'engine') return m.draft_wait_engine();
		if (at.step === 'bibliography') return m.draft_wait_bibliography();
		if (at.step === 'draw') return m.draft_wait_draw();
		if (at.step === 'install') return m.draft_status_installing({ file: at.file ?? '' });
		return at.pass > 1 ? m.draft_wait_typeset_again() : m.draft_wait_typeset();
	}
</script>

<!-- reveal-late: a compile with warm engines lands its pages before a card is worth reading -->
<div
	class="reveal-late bg-surface-50 dark:bg-surface-900 border-surface-300-700 rounded-container m-auto flex w-full max-w-sm shrink-0 flex-col overflow-hidden border text-sm shadow-sm"
>
	<div class="flex h-11 items-center gap-3 px-4">
		<span class="cap-center flex-1 truncate font-semibold">{m.draft_wait_title({ file: basename(props.mainFile) })}</span>
		<span class="text-muted cap-center text-xs tabular-nums">{m.draft_wait_seconds({ secs: seconds })}</span>
	</div>
	<ul class="flex flex-col px-4 pb-3">
		{#each started as at, i (i)}
			{@const next = started[i + 1]}
			<li class="flex h-8 items-center gap-2.5" class:font-medium={!next}>
				{#if next}
					<Check class="text-success-ink size-4 shrink-0" />
				{:else}
					<Loader2 class="size-4 shrink-0 animate-spin" />
				{/if}
				<span class="cap-center flex-1 truncate">{label(at)}</span>
				{#if next}
					<span class="text-muted cap-center text-xs tabular-nums">
						{m.draft_wait_seconds({ secs: ((next.at - at.at) / 1000).toFixed(1) })}
					</span>
				{:else if page && at.step === 'typeset'}
					<span class="text-muted cap-center text-xs font-normal tabular-nums">{m.draft_wait_page({ page })}</span>
				{/if}
			</li>
		{/each}
		{#if !drawing}
			<li class="text-muted flex h-8 items-center gap-2.5">
				<span class="flex size-4 shrink-0 items-center justify-center"><span class="size-1.5 rounded-full bg-current"></span></span>
				<span class="cap-center">{m.draft_wait_draw()}</span>
			</li>
		{/if}
	</ul>
	<!-- five lines tall from the start, so the card keeps its size as the lines arrive -->
	<div class="bg-surface-100 dark:bg-surface-950 border-surface-200-800 border-t px-4 py-3">
		<div class="flex h-22.5 flex-col justify-end overflow-hidden font-mono text-xs leading-[1.125rem]">
			{#each notes as note, i (i)}
				{@const kind = compileNoteKind(note)}
				<span
					class="truncate"
					class:text-muted={kind === 'plain' && i < notes.length - 1}
					class:text-warning-ink={kind === 'warning'}
					class:text-error-ink={kind === 'error'}>{note}</span
				>
			{/each}
		</div>
	</div>
</div>
