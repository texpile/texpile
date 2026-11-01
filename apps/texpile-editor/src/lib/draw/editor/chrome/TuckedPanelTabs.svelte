<script lang="ts">
	import { m } from '$lib/paraglide/messages';
	import { objectRows } from '../objects/objectRows';
	import type { FigureEditorState } from '../state/editorState.svelte';

	type Props = { editor: FigureEditorState; tucked: boolean };
	const props: Props = $props();

	const objects = $derived(objectRows(props.editor, new Set()).length);
	const TAB = 'bg-surface-50-950 border-surface-200-800 rounded-r-base pointer-events-auto border border-l-0 px-1 py-2 text-xs shadow-lg';
	const LABEL = 'block rotate-180 whitespace-nowrap [writing-mode:vertical-rl]';
</script>

<div
	class="pointer-events-none absolute left-0 z-20 flex flex-col gap-1 transition-transform duration-160 ease-out motion-reduce:transition-none {props.tucked
		? ''
		: '-translate-x-full'}"
	style:top="{props.editor.panes.panelsTop}px"
	aria-hidden="true"
	data-figure-panel-tabs
>
	{#if objects}
		<div class={TAB}>
			<span class={LABEL}>{m.figure_objects()} <span class="text-muted">{objects}</span></span>
		</div>
	{/if}
	{#if props.editor.frame}
		<div class={TAB}><span class={LABEL}>{m.figure_inspector_canvas()}</span></div>
	{/if}
</div>
