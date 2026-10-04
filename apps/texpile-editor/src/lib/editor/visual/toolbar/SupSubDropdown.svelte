<script lang="ts">
	// superscript and subscript behind one toolbar button, each turned on or off on its own
	import { tip } from '$lib/components/tooltip.svelte';
	import MenuDropdown from '$lib/menus/MenuDropdown.svelte';
	import { ChevronDown, Superscript, Subscript } from '@lucide/svelte';
	import { combo } from '$lib/chrome/shortcutText';
	import { m } from '$lib/paraglide/messages';

	type Props = {
		/** Whether the current selection has the superscript mark. */
		sup: boolean;
		/** Whether the current selection has the subscript mark. */
		sub: boolean;
		/** Toggle one of the two marks. */
		onToggle: (which: 'sup' | 'sub') => void;
	};

	let { sup, sub, onToggle }: Props = $props();

	const groups = $derived([
		{
			options: [
				{ value: 'sup', label: m.tbar_superscript(), icon: Superscript, keys: combo('.'), checked: sup },
				{ value: 'sub', label: m.tbar_subscript(), icon: Subscript, keys: combo(',', { shift: true }), checked: sub }
			]
		}
	]);
</script>

<MenuDropdown {groups} kind="checkbox" onSelect={(value) => onToggle(value === 'sub' ? 'sub' : 'sup')}>
	{#snippet trigger(attrs)}
		<button
			{...attrs}
			class="rounded-base flex h-7 items-center gap-0.5 px-1.5 transition-colors {sup || sub
				? 'preset-tonal-primary'
				: 'hover:preset-tonal'}"
			aria-label={m.tbar_supsub_aria()}
			use:tip={m.tbar_supsub_title()}
		>
			<!-- same box + stroke as every other toolbar icon so it doesn't read bigger/bolder -->
			<Superscript class="h-5 w-5" />
			<ChevronDown class="size-3 shrink-0" />
		</button>
	{/snippet}
</MenuDropdown>
