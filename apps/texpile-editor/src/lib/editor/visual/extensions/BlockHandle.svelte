<script lang="ts">
	import { tip } from '$lib/components/tooltip.svelte';
	import { inEditorPane } from '$lib/editor/visual/editorPanePositioning';
	import { Popover, Portal } from '@skeletonlabs/skeleton-svelte';
	import { Plus, GripVertical, Settings, Trash2 } from '@lucide/svelte';
	import BlockInsertMenu from '$lib/editor/visual/insert/BlockInsertMenu.svelte';
	import type { BlockInsertItem } from '$lib/editor/visual/insert/insertItem';
	import { m } from '$lib/paraglide/messages';

	type State = {
		visible: boolean;
		top: number;
		left: number;
		right: number;
		/** comments crowd the pane: one column on the left, delete included, and no right gutter */
		stacked: boolean;
		popoverOpen: boolean;
		/** the hint of the gear, for a block that has settings */
		settings: string | null;
	};
	let {
		state,
		onInsert,
		onDragStart,
		onDelete,
		onSettings,
		focusEditor,
		items
	}: {
		state: State;
		onInsert: (item: BlockInsertItem) => void;
		onDragStart: (event: DragEvent) => void;
		onDelete: () => void;
		onSettings: (gear: HTMLElement) => void;
		focusEditor: () => void;
		items: () => readonly BlockInsertItem[];
	} = $props();
</script>

<!-- visibility, not display: Floating-UI anchors the popover to the trigger's rect,
     and display:none would collapse it to (0,0) and pin the popover top-left -->
<div
	class="block-handle-gutter fixed z-10 flex gap-0.5 {state.stacked ? 'flex-col' : 'items-center'}"
	style="visibility: {state.visible ? 'visible' : 'hidden'}; pointer-events: {state.visible
		? 'auto'
		: 'none'}; top: {state.top}px; left: {state.left}px;"
>
	<Popover
		open={state.popoverOpen}
		onOpenChange={(e) => {
			state.popoverOpen = e.open;
			if (!e.open) focusEditor();
		}}
		restoreFocus={false}
		positioning={inEditorPane({ placement: 'bottom-start', offset: { mainAxis: 4 } })}
	>
		<Popover.Trigger class="block-handle-btn" aria-label={m.blockhandle_insert_below()}>
			{#snippet element(attrs)}
				<button {...attrs} use:tip={m.blockhandle_insert_below()}><Plus class="size-4" /></button>
			{/snippet}
		</Popover.Trigger>
		<Portal>
			<Popover.Positioner class="z-floating-ui">
				<Popover.Content class="card bg-surface-50-950 border-surface-300-700 w-72 border shadow-lg">
					{#if state.popoverOpen}
						<BlockInsertMenu items={items()} {onInsert} />
					{/if}
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
	{#if state.stacked}{@render deleteButton()}{@render settingsButton()}{/if}
</div>

<!-- right gutter, the left one mirrored: the block's settings by the text and delete at the outer edge, where it
     stays on a block with no settings. Same visibility rules as the left; with the gutters stacked both are in the left one -->
{#if !state.stacked}
	<div
		class="block-handle-gutter fixed z-10 flex w-[46px] items-center justify-end gap-0.5"
		style="visibility: {state.visible ? 'visible' : 'hidden'}; pointer-events: {state.visible
			? 'auto'
			: 'none'}; top: {state.top}px; left: {state.right}px;"
	>
		{@render settingsButton()}{@render deleteButton()}
	</div>
{/if}

{#snippet deleteButton()}
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
{/snippet}

{#snippet settingsButton()}
	{#if state.settings}
		<button
			type="button"
			class="block-handle-btn block-handle-settings"
			aria-label={state.settings}
			use:tip={state.settings}
			onclick={(e) => onSettings(e.currentTarget)}
		>
			<Settings class="size-4" />
		</button>
	{/if}
{/snippet}
