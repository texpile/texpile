<script lang="ts">
	import { tip } from '$lib/components/tooltip.svelte';
	import type { FindOptions } from './findOptions';
	import { m } from '$lib/paraglide/messages';

	type Props = {
		options: FindOptions;
		onToggle: (key: keyof FindOptions) => void;
		show?: (keyof FindOptions)[];
	};

	let { options, onToggle, show = ['caseSensitive', 'wholeWord', 'regexp'] }: Props = $props();

	const buttons: { key: keyof FindOptions; label: string; title: string }[] = $derived(
		[
			{ key: 'caseSensitive' as const, label: 'Aa', title: m.find_match_case() },
			{ key: 'wholeWord' as const, label: 'ab', title: m.find_whole_word() },
			{ key: 'regexp' as const, label: '.*', title: m.find_use_regex() }
		].filter((b) => show.includes(b.key))
	);
</script>

{#each buttons as b (b.key)}
	<button
		type="button"
		class="find-toggle {options[b.key] ? 'preset-tonal-primary' : 'hover:preset-tonal text-surface-600-300'}"
		class:underline={b.key === 'wholeWord'}
		aria-pressed={options[b.key]}
		use:tip={b.title}
		aria-label={b.title}
		onmousedown={(e) => e.preventDefault()}
		onclick={() => onToggle(b.key)}
	>
		{b.label}
	</button>
{/each}
