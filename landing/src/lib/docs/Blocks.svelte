<script lang="ts">
	import type { Block } from './blocks';
	import Cards from './Cards.svelte';
	import Figure from './Figure.svelte';
	import KeyTable from './KeyTable.svelte';
	import Links from './Links.svelte';
	import Note from './Note.svelte';
	import Where from './Where.svelte';

	let { blocks }: { blocks: Block[] } = $props();
</script>

{#each blocks as block, i (i)}
	{#if block.kind === 'html'}
		{@html block.html}
	{:else if block.kind === 'note'}
		<Note html={block.html} />
	{:else if block.kind === 'figure'}
		<Figure items={block.items} narrow={block.narrow} />
	{:else if block.kind === 'where'}
		<Where rows={block.rows} />
	{:else if block.kind === 'keys'}
		<KeyTable rows={block.rows} />
	{:else if block.kind === 'cards'}
		<Cards items={block.items} />
	{:else}
		<Links items={block.items} />
	{/if}
{/each}
