<script lang="ts">
	import { tip } from '$lib/components/tooltip.svelte';
	import { Popover, Portal } from '@skeletonlabs/skeleton-svelte';
	import { Plus, GripVertical, Trash2 } from '@lucide/svelte';
	import { BLOCK_INSERT_ITEMS, type BlockInsertItem } from './blockInsertItems';
	import { m } from '$lib/paraglide/messages';

	type State = {
		visible: boolean;
		top: number;
		left: number;
		right: number;
		popoverOpen: boolean;
	};
	let {
		state,
		onInsert,
		onDragStart,
		onDelete,
		items = BLOCK_INSERT_ITEMS
	}: {
		state: State;
		onInsert: (item: BlockInsertItem) => void;
		onDragStart: (event: DragEvent) => void;
		onDelete: () => void;
		/** insert-menu entries; defaults to the LaTeX set, the markdown editor passes its own */
		items?: BlockInsertItem[];
	} = $props();
</script>

<!-- visibility, not display: Floating-UI anchors the popover to the trigger's rect,
     and display:none would collapse it to (0,0) and pin the popover top-left -->
<div
	class="block-handle-gutter fixed z-10 flex items-center gap-0.5"
	style="visibility: {state.visible ? 'visible' : 'hidden'}; pointer-events: {state.visible
		? 'auto'
		: 'none'}; top: {state.top}px; left: {state.left}px;"
>
	<Popover
		open={state.popoverOpen}
		onOpenChange={(e) => (state.popoverOpen = e.open)}
		positioning={{ placement: 'bottom-start', offset: { mainAxis: 4 } }}
	>
		<Popover.Trigger class="block-handle-btn" aria-label={m.blockhandle_insert_below()}>
			{#snippet element(attrs)}
				<button {...attrs} use:tip={m.blockhandle_insert_below()}><Plus class="size-4" /></button>
			{/snippet}
		</Popover.Trigger>
		<Portal>
			<Popover.Positioner class="z-floating-ui">
				<Popover.Content class="card bg-surface-50-950 border-surface-300-700 min-w-48 max-w-64 border p-1 shadow-lg">
					<div class="text-muted px-2 py-1 text-[10px] font-semibold tracking-wider uppercase">
						{m.blockhandle_insert_header()}
					</div>
					{#each items as item (item.label)}
						<button
							type="button"
							class="hover:preset-tonal flex w-full items-center gap-2 rounded-base px-2 py-1.5 text-left text-sm"
							onmousedown={(e) => {
								e.preventDefault();
								onInsert(item);
							}}
						>
							<item.icon class="text-muted size-4 shrink-0" />
							<span>{item.label()}</span>
						</button>
					{/each}
				</Popover.Content>
			</Popover.Positioner>
		</Portal>
	</Popover>

	<button
		type="button"
		class="block-handle-btn cursor-grab"
		aria-label={m.blockhandle_drag_move()}
		use:tip={m.blockhandle_drag_move()}
		draggable="true"
		ondragstart={onDragStart}
	>
		<GripVertical class="size-4" />
	</button>
</div>

<!-- right gutter (delete), same visibility rules as the left -->
<div
	class="block-handle-gutter fixed z-10 flex items-center"
	style="visibility: {state.visible ? 'visible' : 'hidden'}; pointer-events: {state.visible
		? 'auto'
		: 'none'}; top: {state.top}px; left: {state.right}px;"
>
	<button
		type="button"
		class="block-handle-btn block-handle-btn-danger"
		aria-label={m.blockhandle_delete_block()}
		use:tip={m.blockhandle_delete_block()}
		onmousedown={(e) => {
			// preventDefault keeps focus on PM; delete runs, then PM refocuses itself
			e.preventDefault();
			onDelete();
		}}
	>
		<Trash2 class="size-4" />
	</button>
</div>
