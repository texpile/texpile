<script lang="ts">
	// one line above the editor about the open file, at the app's bar height (min-h-10, as the PDF, editor and draft
	// toolbars), so it reads as chrome rather than prose shoving the document down
	import type { Component, Snippet } from 'svelte';
	import { tip } from '$lib/components/tooltip.svelte';

	type Props = {
		icon: Component<{ class?: string }>;
		/** info for something to know, warning for something that stops part of the app */
		tone: 'info' | 'warning';
		title: string;
		/** also on hover, when the line is cut short */
		note: string;
		/** buttons at the right end */
		children?: Snippet;
	};
	let { icon: Icon, tone, title, note, children }: Props = $props();

	// a hint repeating a line read whole already is only a card over the document
	let line = $state<HTMLParagraphElement>();
	let cut = $state(false);
	$effect(() => {
		if (!line) return;
		// new words in a box of the same size are measured too
		void title;
		void note;
		const el = line;
		function measure(): void {
			cut = el.scrollWidth > el.clientWidth;
		}
		const observer = new ResizeObserver(measure);
		observer.observe(el);
		return () => observer.disconnect();
	});
</script>

<div class="bg-surface-100-900 text-muted line-under flex min-h-10 shrink-0 items-center gap-2 px-3 text-xs">
	<Icon class="{tone === 'info' ? 'text-primary-ink' : 'text-warning-ink'} size-3.5 shrink-0" />
	<p bind:this={line} class="cap-center min-w-0 flex-1 truncate" use:tip={cut ? `${title} ${note}` : null}>
		<span class="font-medium">{title}</span>
		{note}
	</p>
	{@render children?.()}
</div>
