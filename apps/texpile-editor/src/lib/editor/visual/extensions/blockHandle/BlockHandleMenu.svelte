<script lang="ts">
	import { tip } from '$lib/components/tooltip.svelte';
	import { inEditorPane } from '$lib/editor/visual/editorPanePositioning';
	import { menuContentClass, menuItemClass } from '$lib/menus/menuStyles';
	import { Popover, Portal } from '@skeletonlabs/skeleton-svelte';
	import { GripVertical, Trash2 } from '@lucide/svelte';
	import { m } from '$lib/paraglide/messages';

	type BlockHandleMenuProps = {
		onOpenChange: (open: boolean) => void;
		onDragStart: (event: DragEvent) => void;
		onDelete: () => void;
	};
	const props: BlockHandleMenuProps = $props();
</script>

<!-- a click on the grip opens it and a drag moves the block, as in Notion; delete waits here so a stray click
     beside the text deletes nothing -->
<Popover
	onOpenChange={(e) => props.onOpenChange(e.open)}
	restoreFocus={false}
	positioning={inEditorPane({ placement: 'bottom-start', offset: { mainAxis: 4 } })}
>
	<Popover.Trigger>
		{#snippet element(attrs)}
			<button
				{...attrs}
				class="block-handle-btn cursor-grab"
				aria-label={m.blockhandle_drag_move()}
				use:tip={m.blockhandle_drag_move()}
				draggable="true"
				ondragstart={props.onDragStart}
			>
				<GripVertical class="size-4" />
			</button>
		{/snippet}
	</Popover.Trigger>
	<Portal>
		<Popover.Positioner class="z-floating-ui">
			<Popover.Content class={menuContentClass}>
				<Popover.CloseTrigger>
					{#snippet element(attrs)}
						<button
							{...attrs}
							class="{menuItemClass} text-error-ink"
							aria-label={m.blockhandle_delete_block()}
							onclick={(event) => {
								(attrs.onclick as ((event: MouseEvent) => void) | undefined)?.(event);
								props.onDelete();
							}}
						>
							<Trash2 class="size-4 shrink-0" /><span class="cap-center">{m.blockhandle_delete_block()}</span>
						</button>
					{/snippet}
				</Popover.CloseTrigger>
			</Popover.Content>
		</Popover.Positioner>
	</Portal>
</Popover>
