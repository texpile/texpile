<script lang="ts">
	import { inEditorPane, isReadOnly, tip } from '$lib/languages/latex/visual/core';
	import { Popover, Portal } from '@skeletonlabs/skeleton-svelte';
	import { SlidersHorizontal } from '@lucide/svelte';
	import type { Node } from 'prosemirror-model';

	import { m } from '$lib/paraglide/messages';
	import FrameSettings from './FrameSettings.svelte';

	const props: {
		node: Node;
		updateAttrs: (attrs: Record<string, unknown>) => void;
		addPart: (type: 'frame_title' | 'frame_subtitle') => void;
		/** the frame is the opening slide, which takes its title from the preamble */
		titleSlide: boolean;
	} = $props();

	let open = $state(false);

	function has(type: string): boolean {
		let found = false;
		props.node.forEach((child) => (found ||= child.type.name === type));
		return found;
	}
	const missingTitle = $derived(!has('frame_title'));
	const missingSubtitle = $derived(has('frame_title') && !has('frame_subtitle'));
</script>

<div class="frame-chrome" data-open={open || undefined}>
	{#if !isReadOnly.current && !props.titleSlide}
		{#if missingTitle}
			<button type="button" class="frame-chrome-add" onclick={() => props.addPart('frame_title')}>{m.slide_add_title()}</button>
		{:else if missingSubtitle}
			<button type="button" class="frame-chrome-add" onclick={() => props.addPart('frame_subtitle')}>{m.slide_add_subtitle()}</button>
		{/if}
	{/if}
	{#if props.node.attrs.form === 'env'}
		<Popover {open} onOpenChange={(e) => (open = e.open)} positioning={inEditorPane({ placement: 'bottom-end', offset: { mainAxis: 4 } })}>
			<Popover.Trigger>
				<button
					type="button"
					class="frame-chrome-settings"
					aria-label={m.slide_settings()}
					use:tip={m.slide_settings()}
					disabled={isReadOnly.current}
				>
					<SlidersHorizontal class="size-3.5" />
				</button>
			</Popover.Trigger>
			<Portal>
				<Popover.Positioner class="z-floating-ui">
					<Popover.Content class="card bg-surface-50-950 border-surface-300-700 border shadow-lg">
						{#if open}
							<FrameSettings node={props.node} updateAttrs={props.updateAttrs} />
						{/if}
					</Popover.Content>
				</Popover.Positioner>
			</Portal>
		</Popover>
	{/if}
</div>

<style>
	.frame-chrome {
		display: flex;
		align-items: center;
		justify-content: flex-end;
		gap: calc(var(--spacing) * 1);
		opacity: 0;
		transition: opacity 0.12s;
	}
	:global(.beamer-frame:hover) .frame-chrome,
	:global(.beamer-frame:focus-within) .frame-chrome,
	.frame-chrome[data-open] {
		opacity: 1;
	}
	.frame-chrome-add,
	.frame-chrome-settings {
		display: flex;
		align-items: center;
		padding: calc(var(--spacing) * 1) calc(var(--spacing) * 2);
		border-radius: var(--radius-base);
		font-size: 0.75rem;
		color: var(--faint-text);
	}
	.frame-chrome-add:hover,
	.frame-chrome-settings:hover {
		background: color-mix(in srgb, var(--color-surface-500) 14%, transparent);
		color: var(--muted-text);
	}
</style>
