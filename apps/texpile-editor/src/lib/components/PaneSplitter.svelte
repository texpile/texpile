<script lang="ts">
	// A pane divider: 1px of rule and a 7px grab zone that costs no layout.
	//
	// Overleaf's 7px channel was tried: horizontal rules meet the divider at heights nothing here can know
	// split, the terminal dock, the PDF toolbar. Every one of them stopped short of the rule with a
	// visible notch, and the heights move with the view mode and the TOC fraction, so there is no
	// static set of stubs that closes them. A divider with no width has nothing to disconnect.
	type Props = {
		/** false while the pane it borders is collapsed: there is nothing to size */
		resizable: boolean;
		resizeLabel: string;
		onStartResize: (e: MouseEvent) => void;
		onResizeByKey: (e: KeyboardEvent) => void;
		/** the bottom dock's height when the divider spans past it: the drag zone stops short of it */
		bottomInset?: number;
		/** grid or absolute placement, which only the caller knows */
		class?: string;
		style?: string;
	};
	let { resizable, resizeLabel, onStartResize, onResizeByKey, bottomInset = 0, class: extra = '', style = '' }: Props = $props();
</script>

<!-- the 1px of paint is the container itself, so it costs exactly what the pane border it replaced
     did - and every horizontal rule that meets it still reaches it, which is the whole point.
     A BORDER, not a fill: at 125% or 150% a border is snapped to whole screen pixels and a 1px
     fill lands on one or two of them, so the divider came out thicker than the rules it meets -->
<div class="border-surface-200-800 relative w-px shrink-0 border-l {extra}" {style}>
	<!-- the WAI-ARIA window-splitter pattern (role=separator + tabindex); svelte's a11y rule doesn't special-case it -->
	<!-- eslint-disable-next-line svelte/valid-compile -->
	<div
		class="absolute -inset-x-[3px] transition-colors {resizable ? 'hover:bg-primary-wash active:bg-primary-flood cursor-col-resize' : ''}"
		style="top: 0; bottom: {bottomInset}px"
		onmousedown={resizable ? onStartResize : undefined}
		onkeydown={resizable ? onResizeByKey : undefined}
		role="separator"
		aria-orientation="vertical"
		aria-label={resizeLabel}
		tabindex={resizable ? 0 : -1}
	></div>
</div>
