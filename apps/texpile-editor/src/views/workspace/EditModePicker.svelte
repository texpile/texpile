<script lang="ts">
	// the top bar's switch between editing the document and suggesting changes to it
	import MenuDropdown from '$lib/menus/MenuDropdown.svelte';
	import { ChevronDown, Pencil, SquarePen } from '@lucide/svelte';
	import { tip } from '$lib/components/tooltip.svelte';
	import { m } from '$lib/paraglide/messages';

	let { suggesting, onChange }: { suggesting: boolean; onChange: (v: boolean) => void } = $props();

	const groups = $derived([
		{
			options: [
				{ value: 'editing', label: m.suggest_mode_editing(), note: m.suggest_mode_editing_note(), icon: Pencil, checked: !suggesting },
				{
					value: 'suggesting',
					label: m.suggest_mode_suggesting(),
					note: m.suggest_mode_suggesting_note(),
					icon: SquarePen,
					checked: suggesting
				}
			]
		}
	]);

	function pick(value: string) {
		const next = value === 'suggesting';
		if (next !== suggesting) onChange(next);
	}
</script>

<MenuDropdown {groups} placement="bottom-end" onSelect={pick}>
	{#snippet trigger(attrs)}
		<button
			{...attrs}
			class="btn btn-xs gap-1 {suggesting ? 'preset-filled-primary-500' : 'preset-outlined-surface-200-800 hover:preset-tonal'}"
			aria-label={`${m.suggest_mode_picker()}: ${suggesting ? m.suggest_mode_suggesting() : m.suggest_mode_editing()}`}
			use:tip={suggesting ? m.suggest_mode_on() : m.suggest_mode_off()}
		>
			{#if suggesting}<SquarePen class="size-3.5" />{:else}<Pencil class="size-3.5" />{/if}
			<ChevronDown class="size-3" />
		</button>
	{/snippet}
</MenuDropdown>
