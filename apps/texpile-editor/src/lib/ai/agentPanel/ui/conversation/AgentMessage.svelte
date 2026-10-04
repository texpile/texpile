<script lang="ts">
	// One message. The reader's sits apart at the right; the agent's (Markdown) and the error a turn ended with are
	// plain text. No avatar and no name: whose it is shows by where it sits, as in other chats
	import { CircleAlert } from '@lucide/svelte';
	import { renderMarkdown } from '../../agentMarkdown';
	import AgentFilePill from '../AgentFilePill.svelte';
	import { imageUrl } from '../../attach/pastedImages';
	import { previewedImage } from '../AgentImagePreview.svelte';
	import { tip } from '$lib/components/tooltip.svelte';
	import { m } from '$lib/paraglide/messages';
	import type { Attached, PastedImage } from '../../agentPanel.types';

	type Props = { kind: 'user' | 'agent' | 'error'; text: string; attached?: Attached | null; images?: PastedImage[] };
	const props: Props = $props();
	const html = $derived(props.kind === 'agent' ? renderMarkdown(props.text) : '');
</script>

{#if props.kind === 'user'}
	<!-- what it went with above it, as chats show what was attached -->
	<div class="ml-auto flex max-w-[85%] flex-col items-end gap-1">
		{#if props.attached}<AgentFilePill attached={props.attached} />{/if}
		{#if props.images?.length}
			<div class="flex flex-wrap justify-end gap-1">
				{#each props.images as image, i (i)}
					<button
						type="button"
						class="cursor-zoom-in"
						use:tip={m.agent_panel_image_preview()}
						onclick={() => (previewedImage.current = image)}
					>
						<img
							src={imageUrl(image)}
							alt={m.agent_panel_image()}
							class="border-surface-200-800 rounded-container max-h-32 max-w-full border object-contain"
						/>
					</button>
				{/each}
			</div>
		{/if}
		{#if props.text.trim()}
			<p class="bg-surface-100-900 rounded-container px-3 py-1.5 text-sm leading-relaxed break-words whitespace-pre-wrap">{props.text}</p>
		{/if}
	</div>
{:else if props.kind === 'agent'}
	<!-- eslint-disable-next-line svelte/no-at-html-tags -- markdown-it with html off: the agent's own HTML stays text -->
	<div class="agent-markdown text-sm leading-relaxed break-words">{@html html}</div>
{:else}
	<p class="text-error-ink flex gap-1.5 text-sm leading-relaxed break-words whitespace-pre-wrap">
		<CircleAlert class="mt-0.5 size-4 shrink-0" /><span class="min-w-0">{props.text}</span>
	</p>
{/if}

<style>
	.agent-markdown :global(p) {
		margin: 0.15rem 0 0.35rem;
	}
	.agent-markdown :global(:is(ul, ol)) {
		margin: 0.15rem 0 0.35rem;
		padding-inline-start: 1.25rem;
		list-style: revert;
	}
	.agent-markdown :global(code) {
		font-family: var(--font-mono, ui-monospace, monospace);
		font-size: 0.85em;
		padding: 0 0.25rem;
		border-radius: var(--radius-base);
		background-color: color-mix(in oklab, currentColor 10%, transparent);
	}
	.agent-markdown :global(pre) {
		margin: 0.25rem 0 0.5rem;
		padding: 0.5rem 0.75rem;
		overflow-x: auto;
		border-radius: var(--radius-base);
		background-color: color-mix(in oklab, currentColor 7%, transparent);
	}
	.agent-markdown :global(pre code) {
		padding: 0;
		background: none;
	}
</style>
