<script lang="ts">
	import { bibliographyName, templateFeaturesStore } from '$lib/languages/latex/visual/core';

	const name = $derived(templateFeaturesStore.current.bibliographyName ?? bibliographyName(''));
</script>

{#if name}
	<h1 data-unnumbered="true" class="bibliography-heading">{name}</h1>
{/if}
