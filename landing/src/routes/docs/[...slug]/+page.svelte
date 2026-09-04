<script lang="ts">
	import Blocks from '$lib/docs/Blocks.svelte';
	import DocsHead from '$lib/docs/DocsHead.svelte';

	let { data } = $props();
</script>

<DocsHead title={data.title} description={data.description} path={data.path} />

<header>
	<h1 class="text-surface-900 text-3xl font-bold md:text-4xl">{data.title}</h1>
	{#if data.lead}
		<p class="text-surface-600 mt-4 text-lg leading-relaxed">{@html data.lead}</p>
	{/if}
</header>

<div class="doc prose mt-6 max-w-none">
	<Blocks blocks={data.blocks} />
</div>
