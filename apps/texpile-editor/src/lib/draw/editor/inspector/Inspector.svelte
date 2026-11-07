<script lang="ts">
	import { m } from '$lib/paraglide/messages';
	import { Code, Trash2 } from '@lucide/svelte';
	import { PANEL_NOTE } from '../ui/panelStyles';
	import type { FigureEditorState } from '../state/editorState.svelte';
	import { deleteSelection } from '../state/selection/selectionCommands';
	import { tip } from '$lib/components/tooltip.svelte';
	import PairField from './fields/PairField.svelte';
	import { cmPerUnit } from '../state/sheetFrame';
	import InspectorFields from './InspectorFields.svelte';
	import CircuitPartPicker from '../circuits/CircuitPartPicker.svelte';
	import StyleFields from './StyleFields.svelte';
	import { nextShapeStyle } from '../state/selection/selectionStyle';
	import { ALL_TOOLS } from '../tools/tools';
	import { inSentence } from '../figure/inSentence';
	import InspectorTitle from './InspectorTitle.svelte';

	type Props = { editor: FigureEditorState; showCode?: ((at: number) => void) | null };
	const props: Props = $props();
	const st = $derived(props.editor.selectedStatement);
	const count = $derived(props.editor.selection.length);
	const next = $derived(st ? null : nextShapeStyle(props.editor));
	const placing = $derived(!st && props.editor.tool === 'component');
	const heading = $derived.by(() => {
		const tool = ALL_TOOLS.find((t) => t.id === props.editor.tool);
		if ((next || placing) && tool) return m.figure_inspector_new({ tool: inSentence(tool.name()) });
		if (!st || !props.editor.selectedInfo) return m.figure_inspector_canvas();
		if (count > 1) return m.figure_inspector_shapes({ count });
		return props.editor.language.readLabel(props.editor.source, st) ?? props.editor.selectedInfo.title;
	});
	const named = $derived(st && count === 1 && !next && !placing && props.editor.selectedInfo ? st : null);
</script>

<!-- only while there is something to set, as Excalidraw's style panel -->
{#if st || placing || next || props.editor.frame}
	<section
		class="bg-surface-50-950 border-surface-200-800 rounded-container pointer-events-auto flex min-h-0 flex-col overflow-hidden border shadow-lg"
		data-own-scroll
	>
		<div class="border-surface-200-800 flex h-9 shrink-0 items-center gap-1 border-b pr-1.5 pl-3">
			{#if named}
				<InspectorTitle editor={props.editor} st={named} title={props.editor.selectedInfo!.title} />
			{:else}
				<span class="min-w-0 flex-1 truncate text-sm font-semibold">{heading}</span>
			{/if}
			{#if st}
				{#if props.showCode}
					<button
						class="btn-icon btn-icon-xs hover:preset-tonal"
						onclick={() => props.showCode?.(st.from)}
						aria-label={m.figure_show_code()}
						use:tip={m.figure_show_code()}><Code class="size-3.5 shrink-0" /></button
					>
				{/if}
				<button
					class="btn-icon btn-icon-xs hover:preset-tonal"
					onclick={() => deleteSelection(props.editor)}
					aria-label={m.figure_cmd_delete()}
					use:tip={`${m.figure_cmd_delete()} (Del)`}><Trash2 class="size-3.5 shrink-0" /></button
				>
			{/if}
		</div>
		<div class="min-h-0 flex-1 overflow-y-auto pb-3">
			{#if st}
				<InspectorFields editor={props.editor} />
			{:else if placing}
				<CircuitPartPicker
					parts={props.editor.language.circuitParts}
					value={props.editor.nextPart}
					onpick={(id) => props.editor.pickNextPart(id)}
				/>
				<p class={PANEL_NOTE}>{m.figure_inspector_circuit_note()}</p>
			{:else if next}
				<StyleFields editor={props.editor} shown={next} onpick={(change) => props.editor.pickNextStyle(change)} />
			{:else if props.editor.frame}
				{@const f = props.editor.frame}
				<!-- on the paper; the frame is written in the picture's own units -->
				{@const [cx, cy] = cmPerUnit(props.editor.render.transformOf(0))}
				<PairField
					label={m.figure_inspector_canvas_size()}
					values={[(f.x2 - f.x1) * cx, (f.y2 - f.y1) * cy]}
					clearable
					oncommit={(k, v) =>
						v === null
							? props.editor.clearFrame()
							: props.editor.setFrame({ w: k === 0 ? v / cx : f.x2 - f.x1, h: k === 1 ? v / cy : f.y2 - f.y1 })}
				/>
			{/if}
		</div>
	</section>
{/if}
