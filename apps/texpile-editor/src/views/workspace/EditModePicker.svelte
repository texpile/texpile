<script lang="ts">
	// the top bar's switch between editing the document and suggesting changes to it
	import MenuDropdown from '$lib/menus/MenuDropdown.svelte';
	import { ChevronDown, Pencil, SquarePen } from '@lucide/svelte';
	import { tip } from '$lib/components/tooltip.svelte';
	import { m } from '$lib/paraglide/messages';

	// `compact`: the title bar's, unboxed at the bar's height
	const props: { suggesting: boolean; onChange: (v: boolean) => void; compact?: boolean } = $props();
	const quiet = $derived(props.compact ? 'hover:preset-tonal' : 'preset-outlined-surface-200-800 bg-surface-50-950 hover:preset-tonal');

	const groups = $derived([
		{
			options: [
				{
					value: 'editing',
					label: m.suggest_mode_editing(),
					note: m.suggest_mode_editing_note(),
					icon: Pencil,
					checked: !props.suggesting
				},
				{
					value: 'suggesting',
					label: m.suggest_mode_suggesting(),
					note: m.suggest_mode_suggesting_note(),
					icon: SquarePen,
					checked: props.suggesting
				}
			]
		}
	]);

	function pick(value: string) {
		const next = value === 'suggesting';
		if (next !== props.suggesting) props.onChange(next);
	}
</script>

<MenuDropdown {groups} placement="bottom-end" onSelect={pick}>
	{#snippet trigger(attrs)}
		<button
			{...attrs}
			class="btn btn-xs gap-1 {props.suggesting ? 'preset-filled-primary-500' : quiet} {props.compact ? 'h-[22px] px-1.5' : ''}"
			aria-label={`${m.suggest_mode_picker()}: ${props.suggesting ? m.suggest_mode_suggesting() : m.suggest_mode_editing()}`}
			use:tip={props.suggesting ? m.suggest_mode_on() : m.suggest_mode_off()}
		>
			{#if props.suggesting}<SquarePen class="size-3.5" />{:else}<Pencil class="size-3.5" />{/if}
			<ChevronDown class="size-3" />
		</button>
	{/snippet}
</MenuDropdown>
