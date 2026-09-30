<script lang="ts">
	// the optional text a citation carries after the work: page numbers, a chapter
	import { m } from '$lib/paraglide/messages';

	let {
		value = $bindable(),
		label,
		placeholder,
		hint
	}: {
		value: string;
		label: string;
		placeholder: string;
		hint: string;
	} = $props();
</script>

<label class="mb-4 block">
	<span class="text-surface-900-100 text-sm font-medium">{label}</span>
	<span class="text-muted ml-1 text-xs">{m.citation_optional()}</span>
	<input type="text" bind:value {placeholder} class="input mt-1.5 w-full" />
	<span class="text-muted mt-1 block text-xs"> {hint} </span>
</label>
