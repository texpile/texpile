<script lang="ts">
	// A pane divider: 1px of rule, a 7px grab zone that costs no layout, and a lozenge where a
	// control lives. A lozenge on a hairline reads as the line thickening; a circle dropped on one
	// reads as a bead threaded on it, which is the thing that looked wrong before any of this.
	//
	// Reserving real width (Overleaf's 7px channel) was tried and reverted. It does solve the
	// toggle landing on a pane's scrollbar - but this layout runs horizontal rules INTO the divider
	// from both sides at heights nothing here can know: the tab strip, the format toolbar, the TOC
	// split, the terminal dock, the PDF toolbar. Every one of them stopped short of the rule with a
	// visible notch, and the heights move with the view mode and the TOC fraction, so there is no
	// static set of stubs that closes them. A divider with no width has nothing to disconnect.
	//
	// A collapsed pane keeps its divider, not draggable and with the chevron flipped. That is the
	// way back in, and it means the control never has to overhang into the editor.
	import { tip } from '$lib/components/tooltip.svelte';
	import type { Component } from 'svelte';

	type Props = {
		/** false while the pane it borders is collapsed: there is nothing to size */
		resizable: boolean;
		resizeLabel: string;
		onStartResize: (e: MouseEvent) => void;
		onResizeByKey: (e: KeyboardEvent) => void;
		/** the collapse/expand lozenge; omit for a divider that only resizes */
		toggle?: { icon: Component; onclick: () => void; title: string; ariaLabel: string } | null;
		/**
		 * Height, in px, of whatever sits above this divider's real start - the editor's toolbar for
		 * the sidebar, nothing for the preview, which begins below it already.
		 *
		 * The line is still drawn up there; what stops is the drag zone, and the toggle centres on
		 * what is left, so this rail's control lines up with the preview's.
		 */
		topInset?: number;
		/**
		 * Same, for whatever sits below - the bottom dock, when this divider spans past it.
		 *
		 * The rule is drawn the whole way; only the drag zone and the toggle stop short. That lets a
		 * rail run the full height of the window while its toggle stays level with the one on the
		 * divider it replaced, instead of sliding down the moment the dock is out of the span.
		 */
		bottomInset?: number;
		/** grid or absolute placement, which only the caller knows */
		class?: string;
		style?: string;
	};
	let {
		resizable,
		resizeLabel,
		onStartResize,
		onResizeByKey,
		toggle = null,
		topInset = 0,
		bottomInset = 0,
		class: extra = '',
		style = ''
	}: Props = $props();
</script>

<!-- the 1px of paint is the container itself, so it costs exactly what the pane border it replaced
     did - and every horizontal rule that meets it still reaches it, which is the whole point -->
<div class="bg-surface-200-800 relative w-px shrink-0 {extra}" {style}>
	<!-- the WAI-ARIA window-splitter pattern (role=separator + tabindex); svelte's a11y rule doesn't special-case it -->
	<!-- eslint-disable-next-line svelte/valid-compile -->
	<div
		class="absolute -inset-x-[3px] transition-colors {resizable ? 'hover:bg-primary-wash active:bg-primary-flood cursor-col-resize' : ''}"
		style="top: {topInset}px; bottom: {bottomInset}px"
		onmousedown={resizable ? onStartResize : undefined}
		onkeydown={resizable ? onResizeByKey : undefined}
		role="separator"
		aria-orientation="vertical"
		aria-label={resizeLabel}
		tabindex={resizable ? 0 : -1}
	></div>
	{#if toggle}
		{@const Icon = toggle.icon}
		<!-- The swell is what says "there is a control on this line" - the darker inner bar alone is
		     too small to carry that. It used to be a separate element BEHIND the button, which is
		     why hover only lit the middle of what looks like one control: the pad was not part of
		     the button and CSS cannot reach a preceding sibling. Now the button IS the pad and the
		     bar is its child, so hovering colours the whole lozenge and the hit area is the whole
		     lozenge too.

		     It straddles the rule, overhanging 3px into each pane - which is why the scroll
		     containers either side wear `scroll-inset-r`, at exactly that 3px.

		     A SIBLING of the separator, not a child: nesting it made hovering the toggle light the
		     whole drag strip. preventDefault keeps the caret where it was. -->
		<button
			class="bg-surface-300-700 hover:bg-primary-500 group absolute left-1/2 z-30 flex h-[72px] w-[7px] -translate-x-1/2 -translate-y-1/2 cursor-pointer items-center justify-center rounded-full text-white transition-colors"
			style="top: calc(50% + {(topInset - bottomInset) / 2}px)"
			onmousedown={(e) => e.preventDefault()}
			onclick={toggle.onclick}
			use:tip={toggle.title}
			aria-label={toggle.ariaLabel}
		>
			<span
				class="bg-surface-500-600 group-hover:bg-primary-500 pointer-events-none absolute inset-x-0 top-1/2 h-11 -translate-y-1/2 rounded-full transition-colors"
			></span>
			<Icon class="relative size-3.5 shrink-0" />
		</button>
	{/if}
</div>
