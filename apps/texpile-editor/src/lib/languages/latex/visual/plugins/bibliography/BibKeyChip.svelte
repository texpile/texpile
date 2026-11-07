<script lang="ts">
	import { tip } from '$lib/languages/latex/visual/core';
	import { Tag } from '@lucide/svelte';
	import { m } from '$lib/paraglide/messages';

	const props: { entryKey: string; onOpen: () => void } = $props();
</script>

<button
	type="button"
	class="text-chip"
	style="text-indent: 0;"
	onclick={props.onOpen}
	use:tip={m.bib_key_chip_title({ key: props.entryKey })}
>
	<Tag />
	<span class="text-chip-name">{props.entryKey || m.bib_key_empty()}</span>
</button>
