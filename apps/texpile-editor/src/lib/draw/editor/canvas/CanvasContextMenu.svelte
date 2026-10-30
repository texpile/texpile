<script lang="ts">
	import { Menu, Portal } from '@skeletonlabs/skeleton-svelte';
	import { runEditCommand, selectionCommands, type EditCommand } from '../chrome/editCommands';
	import { shortcutText } from '../chrome/menubar/shortcutText';
	import type { FigureEditorState } from '../state/editorState.svelte';
	import MenuBarItem from '../chrome/menubar/MenuBarItem.svelte';
	import { menuContentClass, separatorClass } from '../ui/menuStyles';

	type Props = { editor: FigureEditorState };
	const props: Props = $props();

	const at = $derived(props.editor.contextMenuAt);
	// on a shape what can be done to it, on the empty canvas what can be done to the view
	const commands = $derived<EditCommand[]>(
		props.editor.selection.length
			? selectionCommands(props.editor)
			: [
					{ value: 'paste', label: 'Paste', shortcut: shortcutText('V') },
					{ value: 'select-all', label: 'Select all', shortcut: shortcutText('A') },
					null,
					{ value: 'grid', label: props.editor.gridShown ? 'Hide the grid' : 'Show the grid', shortcut: shortcutText("'") },
					{ value: 'fit', label: 'Fit the sheet', shortcut: shortcutText('1', { mod: false, shift: true }) },
					{ value: 'shortcuts', label: 'Keyboard shortcuts', shortcut: '?' }
				]
	);

	function runCommand(value: string) {
		const ed = props.editor;
		if (value === 'grid') ed.toggleGrid();
		else if (value === 'fit') ed.fitView();
		else if (value === 'shortcuts') ed.shortcutsShown = true;
		else runEditCommand(ed, value);
	}
</script>

<Menu
	open={!!at}
	onOpenChange={(d) => !d.open && (props.editor.contextMenuAt = null)}
	onSelect={(d) => runCommand(d.value)}
	positioning={{ placement: 'bottom-start', getAnchorRect: () => (at ? { x: at.x, y: at.y, width: 0, height: 0 } : null) }}
>
	<Portal>
		<Menu.Positioner>
			<Menu.Content class={menuContentClass} aria-label="Shape menu">
				{#each commands as c, n (c?.value ?? `gap${n}`)}
					{#if c}
						<MenuBarItem value={c.value} label={c.label} shortcut={c.shortcut} disabled={c.disabled} />
					{:else}
						<Menu.Separator class={separatorClass} />
					{/if}
				{/each}
			</Menu.Content>
		</Menu.Positioner>
	</Portal>
</Menu>
