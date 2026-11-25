<script lang="ts">
	import { keepInView } from '$lib/menus/keepInView';
	import type { MatchedOption } from './completionMatch';
	import { infoContent } from './completionInfo';

	type CompletionMenuProps = { matches: MatchedOption[]; selected: number; onPick: (index: number) => void };
	const props: CompletionMenuProps = $props();
	const current = $derived(props.matches[props.selected]?.option);
</script>

<div class="flex items-start gap-1">
	<div
		class="bg-surface-50-950 border-surface-300-700 rounded-base max-h-[15em] overflow-y-auto border p-1 font-mono text-xs shadow-2xl"
		role="listbox"
		tabindex="-1"
	>
		{#each props.matches as match, index (index)}
			{@const label = match.option.label}
			<button
				type="button"
				tabindex="-1"
				class="flex w-full items-center gap-1.5 rounded-[calc(var(--radius-base)*0.75)] px-1.5 py-0.5 text-left {index === props.selected
					? 'bg-[var(--editor-selection)]'
					: ''}"
				role="option"
				aria-selected={index === props.selected}
				onmousedown={(event) => event.preventDefault()}
				onclick={() => props.onPick(index)}
				use:keepInView={index === props.selected}
			>
				<span class="flex-[1_0_auto] whitespace-pre"
					>{#if match.matched}{label.slice(0, match.matched[0])}<span class="text-primary-ink font-semibold"
							>{label.slice(...match.matched)}</span
						>{label.slice(match.matched[1])}{:else}{label}{/if}</span
				>
				{#if match.option.detail}
					<span class="ml-3 max-w-[24em] min-w-0 shrink truncate font-sans opacity-60">{match.option.detail}</span>
				{/if}
			</button>
		{/each}
	</div>
	{#if current?.info}
		<div
			class="bg-surface-50-950 border-surface-300-700 rounded-base max-w-[280px] border p-2 text-xs shadow-2xl"
			{@attach infoContent(current)}
		></div>
	{/if}
</div>
