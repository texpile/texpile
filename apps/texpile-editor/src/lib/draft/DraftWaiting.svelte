<script lang="ts">
	// the wait before the first pages: the compile's steps as they start, and what TeX names as it goes
	import { Check, Loader2 } from '@lucide/svelte';
	import { m } from '$lib/paraglide/messages';
	import type { CompileProgress, StartedStep } from './compileProgress.svelte';

	const props: { progress: CompileProgress } = $props();
	const { started, notes } = $derived(props.progress);
	const drawing = $derived(started.at(-1)?.step === 'draw');

	function label(at: StartedStep): string {
		if (at.step === 'engine') return m.draft_wait_engine();
		if (at.step === 'bibliography') return m.draft_wait_bibliography();
		if (at.step === 'draw') return m.draft_wait_draw();
		if (at.step === 'install') return m.draft_status_installing({ file: at.file ?? '' });
		return at.pass > 1 ? m.draft_wait_typeset_again() : m.draft_wait_typeset();
	}
</script>

<!-- reveal-late: a compile with warm engines lands its pages before a list is worth reading -->
<div class="reveal-late m-auto flex w-full max-w-xs flex-col gap-4 text-sm">
	<ul class="flex flex-col gap-2">
		{#each started as at, i (i)}
			<li class="flex items-center gap-2">
				{#if i < started.length - 1}
					<Check class="text-muted size-4 shrink-0" />
				{:else}
					<Loader2 class="size-4 shrink-0 animate-spin" />
				{/if}
				<span class="cap-center" class:text-muted={i < started.length - 1}>{label(at)}</span>
			</li>
		{/each}
		{#if !drawing}
			<li class="text-faint flex items-center gap-2">
				<span class="size-4 shrink-0"></span>
				<span class="cap-center">{m.draft_wait_draw()}</span>
			</li>
		{/if}
	</ul>
	<!-- six lines tall from the start, so the list above keeps its place as the lines arrive -->
	<div class="text-faint flex h-27 flex-col justify-end overflow-hidden font-mono text-xs leading-[1.125rem]">
		{#each notes as note, i (i)}
			<span class="truncate">{note}</span>
		{/each}
	</div>
</div>
