<script lang="ts">
	// the top bar's switch between editing the document and suggesting changes to it
	import MenuDropdown from '$lib/menus/MenuDropdown.svelte';
	import { ChevronDown, Pencil, SquarePen } from '@lucide/svelte';
	import { tip } from '$lib/components/tooltip.svelte';
	import { m } from '$lib/paraglide/messages';

	// `unavailable`: why suggesting cannot be turned on here, said on a grayed button rather than leaving it out;
	// `compact`: the title bar's, unboxed at the bar's height
	let {
		suggesting,
		onChange,
		unavailable,
		compact = false
	}: { suggesting: boolean; onChange: (v: boolean) => void; unavailable?: string; compact?: boolean } = $props();
	const quiet = $derived(compact ? 'hover:preset-tonal' : 'preset-outlined-surface-200-800 bg-surface-50-950 hover:preset-tonal');

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

{#if unavailable}
	<!-- aria-disabled, not disabled: a disabled button takes no hover, and the hover is what says why -->
	<button
		class="btn btn-xs {compact ? 'h-[22px] px-1.5' : 'preset-outlined-surface-200-800 bg-surface-50-950'} cursor-default gap-1 opacity-50"
		aria-disabled="true"
		use:tip={unavailable}
	>
		<Pencil class="size-3.5" />
		<ChevronDown class="size-3" />
	</button>
{:else}
	<MenuDropdown {groups} placement="bottom-end" onSelect={pick}>
		{#snippet trigger(attrs)}
			<button
				{...attrs}
				class="btn btn-xs gap-1 {suggesting ? 'preset-filled-primary-500' : quiet} {compact ? 'h-[22px] px-1.5' : ''}"
				aria-label={`${m.suggest_mode_picker()}: ${suggesting ? m.suggest_mode_suggesting() : m.suggest_mode_editing()}`}
				use:tip={suggesting ? m.suggest_mode_on() : m.suggest_mode_off()}
			>
				{#if suggesting}<SquarePen class="size-3.5" />{:else}<Pencil class="size-3.5" />{/if}
				<ChevronDown class="size-3" />
			</button>
		{/snippet}
	</MenuDropdown>
{/if}
