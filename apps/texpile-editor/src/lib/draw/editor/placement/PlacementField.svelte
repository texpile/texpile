<script lang="ts">
	import { FIELD_LABEL, NUMBER_AFFIX, NUMBER_BOX, NUMBER_INPUT } from '../ui/panelStyles';
	import { ArrowDown, ArrowDownLeft, ArrowDownRight, ArrowLeft, ArrowRight, ArrowUp, ArrowUpLeft, ArrowUpRight, Dot } from '@lucide/svelte';
	import type { NodePlacement, PlaceDirection } from '../figure/figureLanguage';
	import type { FigureEditorState } from '../state/editorState.svelte';
	import { tip } from '../ui/tooltip';
	import { freeSelected, placeSelected, placeTargets } from './placementCommands';

	// the sides as the grid shows them, the middle frees it to a point
	const SIDES: (PlaceDirection | null)[] = [
		'above left',
		'above',
		'above right',
		'left',
		null,
		'right',
		'below left',
		'below',
		'below right'
	];
	const ICONS = [ArrowUpLeft, ArrowUp, ArrowUpRight, ArrowLeft, Dot, ArrowRight, ArrowDownLeft, ArrowDown, ArrowDownRight];

	type Props = { editor: FigureEditorState; placement: NodePlacement };
	const props: Props = $props();

	const targets = $derived(placeTargets(props.editor));

	function place(change: Partial<NodePlacement>) {
		return placeSelected(props.editor, { ...props.placement, ...change });
	}
</script>

<div class="px-3 pt-2.5">
	<div class={FIELD_LABEL}>Placed</div>
	<div class="flex gap-3">
		<div class="border-surface-300-700 rounded-container grid shrink-0 grid-cols-3 overflow-hidden border" role="group" aria-label="Side">
			{#each SIDES as side, k (k)}
				{@const Icon = ICONS[k]}
				<button
					class="flex items-center justify-center p-1 {side === props.placement.direction
						? 'bg-primary-tint text-primary-ink'
						: 'hover:preset-tonal'}"
					aria-pressed={side === props.placement.direction}
					aria-label={side ? `${side} of ${props.placement.of}` : 'At a point'}
					use:tip={side ? `${side[0].toUpperCase()}${side.slice(1)} of ${props.placement.of}` : 'At a point, where it is now'}
					onclick={() => (side ? place({ direction: side }) : freeSelected(props.editor))}><Icon class="size-3.5" /></button
				>
			{/each}
		</div>
		<div class="flex min-w-0 flex-1 flex-col gap-1.5">
			<label class={NUMBER_BOX}>
				<span class="{NUMBER_AFFIX} w-16 pr-0">Distance</span>
				<input
					class="{NUMBER_INPUT} font-mono"
					value={props.placement.distance}
					placeholder="auto"
					onchange={(e) => place({ distance: e.currentTarget.value })}
					onkeydown={(e) => e.key === 'Enter' && e.currentTarget.blur()}
				/>
			</label>
			<label class={NUMBER_BOX}>
				<span class="{NUMBER_AFFIX} w-16 pr-0">Of</span>
				<select
					class="min-w-0 flex-1 border-0 bg-transparent px-2 font-mono text-xs outline-none"
					value={props.placement.of}
					onchange={(e) => place({ of: e.currentTarget.value })}
				>
					{#if !targets.includes(props.placement.of)}<option value={props.placement.of}>{props.placement.of}</option>{/if}
					{#each targets as name (name)}<option value={name}>{name}</option>{/each}
				</select>
			</label>
		</div>
	</div>
</div>
