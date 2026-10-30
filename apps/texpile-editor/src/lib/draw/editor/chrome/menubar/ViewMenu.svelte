<script lang="ts">
	import { Check } from '@lucide/svelte';
	import { Menu, Portal } from '@skeletonlabs/skeleton-svelte';
	import type { FigureEditorState } from '../../state/editorState.svelte';
	import { menuBarItemClass, menuContentClass, separatorClass } from '../../ui/menuStyles';
	import MenuBarItem from './MenuBarItem.svelte';
	import MenuBarTrigger from './MenuBarTrigger.svelte';
	import { shortcutText } from './shortcutText';

	type Props = { editor: FigureEditorState };
	const props: Props = $props();

	const panes = $derived(props.editor.panes);
	const panels = $derived([
		{ value: 'code', label: 'Code', open: panes.codeOpen },
		{ value: 'objects', label: 'Objects', open: panes.sideShown && panes.objectsOpen },
		{ value: 'inspector', label: 'Inspector', open: panes.sideShown && panes.inspectorOpen }
	]);

	function selectViewItem(value: string) {
		if (value === 'objects') panes.toggleObjects();
		else if (value === 'code') panes.toggleCode();
		else if (value === 'inspector') panes.toggleInspector();
		else if (value === 'zoom-in') props.editor.viewport.zoomIn();
		else if (value === 'zoom-out') props.editor.viewport.zoomOut();
		else if (value === 'zoom-100') props.editor.viewport.zoomToPercent(100);
		else if (value === 'fit') props.editor.fitView();
		else if (value === 'fit-selection') props.editor.fitSelection();
		else if (value === 'grid') props.editor.toggleGrid();
		else if (value === 'redraw') props.editor.redraw();
	}
</script>

<Menu onSelect={(d) => selectViewItem(d.value)}>
	<MenuBarTrigger label="View" />
	<Portal>
		<Menu.Positioner>
			<Menu.Content class={menuContentClass}>
				{#each panels as p (p.value)}
					<Menu.Item value={p.value} class={menuBarItemClass}>
						<Menu.ItemText>{p.label}</Menu.ItemText>
						<Check class="size-4 {p.open ? '' : 'invisible'}" />
					</Menu.Item>
				{/each}
				<Menu.Separator class={separatorClass} />
				<Menu.Item value="grid" class={menuBarItemClass}>
					<Menu.ItemText>Grid</Menu.ItemText>
					<span class="flex items-center gap-2"
						><span class="opacity-50">{shortcutText("'")}</span><Check class="size-4 {props.editor.gridShown ? '' : 'invisible'}" /></span
					>
				</Menu.Item>
				<Menu.Separator class={separatorClass} />
				<MenuBarItem value="zoom-in" label="Zoom in" shortcut={shortcutText('+')} />
				<MenuBarItem value="zoom-out" label="Zoom out" shortcut={shortcutText('-')} />
				<MenuBarItem value="zoom-100" label="Zoom to 100%" shortcut={shortcutText('0')} />
				<MenuBarItem value="fit" label="Fit the sheet" shortcut={shortcutText('1', { mod: false, shift: true })} />
				<MenuBarItem
					value="fit-selection"
					label="Fit the selection"
					shortcut={shortcutText('2', { mod: false, shift: true })}
					disabled={!props.editor.selection.length}
				/>
				<Menu.Separator class={separatorClass} />
				<MenuBarItem value="redraw" label="Draw the canvas again" />
			</Menu.Content>
		</Menu.Positioner>
	</Portal>
</Menu>
