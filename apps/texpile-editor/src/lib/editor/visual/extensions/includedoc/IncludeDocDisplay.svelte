<script lang="ts">
	import { tip } from '$lib/components/tooltip.svelte';
	import type { Node as PMNode } from 'prosemirror-model';
	import { FileSymlink } from '@lucide/svelte';

	let { node, onOpen }: { node: PMNode; onOpen: () => void } = $props();

	const path = $derived(String(node.attrs.path ?? ''));
	const command = $derived(String(node.attrs.command ?? 'input'));
</script>

<button
	type="button"
	class="includedoc-chip"
	use:tip={command === 'typst' ? `Open #include "${path}"` : `Open \\${command}{${path}}`}
	onclick={onOpen}
	contenteditable="false"
>
	<FileSymlink class="size-3.5 shrink-0 opacity-55" />
	{#if command === 'typst'}
		<!-- reads like real typst, same as the latex form below reads like real latex -->
		<span class="includedoc-code"
			><span class="includedoc-syntax">#include "</span><span class="includedoc-path">{path}</span><span class="includedoc-syntax">"</span
			></span
		>
	{:else}
		<span class="includedoc-code"
			><span class="includedoc-syntax">\{command}{'{'}</span><span class="includedoc-path">{path}</span><span class="includedoc-syntax"
				>}</span
			></span
		>
	{/if}
</button>

<style>
	/* reads like real latex: tight monospace, matching the \begin{...} header */
	.includedoc-chip {
		display: inline-flex;
		align-items: center;
		gap: 0.3rem;
		margin: 0.4rem 0;
		padding: 0.1rem 0.3rem;
		border: none;
		background: transparent;
		border-radius: var(--radius-base);
		font-family: ui-monospace, SFMono-Regular, Menlo, Consolas, monospace;
		font-size: 11px;
		cursor: pointer;
		user-select: none;
		transition: background 0.12s ease;
	}
	.includedoc-chip:hover {
		background: color-mix(in srgb, var(--color-surface-500) 12%, transparent);
	}
	.includedoc-chip:hover .includedoc-path {
		text-decoration: underline;
	}
	.includedoc-syntax {
		color: var(--muted-text);
	}
	.includedoc-path {
		font-weight: 600;
		color: var(--primary-ink);
	}
</style>
