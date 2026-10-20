<script lang="ts">
	import { replacementDiffParts } from '$lib/editor/spellcheck/replacementDiff';
	import IconArrowUp from '@lucide/svelte/icons/arrow-up';
	import IconPlus from '@lucide/svelte/icons/plus';
	import type { DiagnosticCardFix } from './diagnosticCardTypes';
	import { fixLabelParts } from './fixLabelParts';

	const props: { fix: DiagnosticCardFix } = $props();
	const fix = $derived(props.fix);
	const diffParts = $derived(fix.replacing === undefined ? null : replacementDiffParts(fix.replacing, fix.label));
	const parts = $derived(fixLabelParts(fix.label, fix.code));
</script>

<!-- mousedown keeps the editor's focus: the tooltip closes with it -->
<button
	type="button"
	class="text-primary-ink flex cursor-pointer items-start gap-1.5 pl-[22px] text-left text-xs hover:underline"
	onmousedown={(e) => e.preventDefault()}
	onclick={fix.apply}
>
	{#if fix.kind === 'add'}
		<IconPlus size={12} class="mt-0.5 shrink-0" />
	{:else if fix.kind === 'move'}
		<IconArrowUp size={12} class="mt-0.5 shrink-0" />
	{/if}
	<span class="[overflow-wrap:anywhere]">
		{#if diffParts}
			<span class="font-mono">
				{#each diffParts as part, i (i)}
					{#if part.removed}
						<del class="text-error-ink line-through opacity-60">{part.value}</del>
					{:else if part.added}
						<ins class="text-success-ink font-bold no-underline">{part.value}</ins>
					{:else}
						<span>{part.value}</span>
					{/if}
				{/each}
			</span>
		{:else}
			{parts.before}<span class="font-mono">{parts.code}</span>{parts.after}
		{/if}
	</span>
</button>
