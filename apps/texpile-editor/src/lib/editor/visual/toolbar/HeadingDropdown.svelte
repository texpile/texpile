<script lang="ts">
	// the LaTeX toolbar's heading picker: a normal paragraph, or a section level numbered or not (\section, \section*)
	import MenuDropdown, { type DropdownGroup } from '$lib/menus/MenuDropdown.svelte';
	import { m } from '$lib/paraglide/messages';

	type Props = {
		/** Current heading level of the selection (0 = normal paragraph). */
		level: number;
		/** Whether the current heading is numbered (\section vs \section*). */
		numbered: boolean;
		/** Apply a heading level (0 = normal) with the chosen numbering. */
		onSelect: (level: number, numbered: boolean) => void;
	};

	let { level, numbered, onSelect }: Props = $props();

	const LEVELS = [
		{ level: 1, name: m.tbar_heading_section, number: '1' },
		{ level: 2, name: m.tbar_heading_subsection, number: '1.1' },
		{ level: 3, name: m.tbar_heading_subsubsection, number: '1.1.1' }
	];

	const groups: DropdownGroup[] = $derived([
		{ options: [{ value: '0', label: m.tbar_heading_normal(), marker: '', checked: level === 0 }] },
		{
			label: m.tbar_heading_numbered(),
			options: LEVELS.map((l) => ({ value: `n${l.level}`, label: l.name(), marker: l.number, checked: level === l.level && numbered }))
		},
		{
			label: m.tbar_heading_unnumbered(),
			options: LEVELS.map((l) => ({ value: `u${l.level}`, label: l.name(), marker: '*', checked: level === l.level && !numbered }))
		}
	]);

	const label = $derived.by(() => {
		const l = LEVELS.find((x) => x.level === level);
		return l ? l.name() + (numbered ? '' : '*') : m.tbar_heading_normal();
	});
</script>

<MenuDropdown {groups} {label} onSelect={(value) => onSelect(Number(value.slice(-1)), !value.startsWith('u'))} />
