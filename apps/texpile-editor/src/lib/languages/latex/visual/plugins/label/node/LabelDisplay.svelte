<script lang="ts">
	import { liveRefProblems, refProblemText, tip } from '$lib/languages/latex/visual/core';
	import { Tag } from '@lucide/svelte';
	import { m } from '$lib/paraglide/messages';

	let { name, onOpen }: { name: string; onOpen: () => void } = $props();

	const twice = $derived(liveRefProblems.current?.problems.find((p) => p.kind === 'label-twice' && p.name === name) ?? null);
</script>

<button type="button" class="text-chip" onclick={onOpen} use:tip={twice ? refProblemText(twice) : m.label_chip_title({ name })}>
	<Tag class={twice ? 'text-ref-broken-fg' : ''} />
	<span class="text-chip-name {twice ? 'text-ref-broken-fg' : ''}">{name}</span>
</button>
