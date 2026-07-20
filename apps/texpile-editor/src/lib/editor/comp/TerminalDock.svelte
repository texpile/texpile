<script lang="ts">
	// Grid placement + drag-resize around BottomDock. Stays mounted while hidden so the shells
	// survive; shrunk it sits under the editor column so the preview keeps full height.
	import BottomDock from './BottomDock.svelte';
	import { m } from '$lib/paraglide/messages';

	interface Props {
		visible: boolean;
		height: number;
		shrink: boolean;
		dockShrunk: boolean;
		cwd: string;
		pdfPaneOpen: boolean;
		view: 'terminal' | 'problems';
		dock?: BottomDock;
		onStartResize: (e: MouseEvent) => void;
		onResizeByKey: (e: KeyboardEvent) => void;
		onToggleShrink: () => void;
		onClose: () => void;
		onProblemJump: (file: string, line: number, selectText?: string) => void;
	}
	let {
		visible,
		height,
		shrink,
		dockShrunk,
		cwd,
		pdfPaneOpen,
		view = $bindable(),
		dock = $bindable(),
		onStartResize,
		onResizeByKey,
		onToggleShrink,
		onClose,
		onProblemJump
	}: Props = $props();
</script>

{#if visible}
	<!-- the WAI-ARIA window-splitter pattern (role=separator + tabindex); svelte's a11y rule doesn't special-case it -->
	<!-- eslint-disable-next-line svelte/valid-compile -->
	<div
		class="hover:bg-primary-500/40 active:bg-primary-500/60 h-1 shrink-0 cursor-row-resize bg-transparent transition-colors"
		style="grid-row: 3; grid-column: {dockShrunk ? '1' : '1 / -1'}"
		onmousedown={onStartResize}
		onkeydown={onResizeByKey}
		role="separator"
		aria-orientation="horizontal"
		aria-label={m.wsview_resize_terminal_aria()}
		tabindex="0"
	></div>
{/if}
<section
	class="border-surface-200-800 flex shrink-0 flex-col border-t"
	style={`${visible ? `height: ${height}px` : 'display: none'}; grid-row: 4; grid-column: ${dockShrunk ? '1' : '1 / -1'}`}
>
	<BottomDock bind:this={dock} bind:view {cwd} {pdfPaneOpen} {shrink} {onToggleShrink} {onClose} {onProblemJump} />
</section>
