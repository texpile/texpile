<script lang="ts">
	// the Markdown toolbar's heading picker, each level beside the `#` marks that write it
	import MenuDropdown from '$lib/menus/MenuDropdown.svelte';
	import { m } from '$lib/paraglide/messages';

	type Props = {
		/** Current heading level of the selection (0 = paragraph). */
		level: number;
		onSelect: (level: number) => void;
	};
	let { level, onSelect }: Props = $props();

	function name(lvl: number): string {
		return lvl === 0 ? m.mdtoolbar_paragraph() : m.mdtoolbar_heading_n({ n: lvl });
	}
	const groups = $derived([
		{
			options: [0, 1, 2, 3, 4, 5, 6].map((lvl) => ({
				value: String(lvl),
				label: name(lvl),
				marker: '#'.repeat(lvl),
				checked: level === lvl
			}))
		}
	]);
</script>

<MenuDropdown {groups} label={name(level)} onSelect={(value) => onSelect(Number(value))} />
