<script lang="ts">
	import { Menu, Portal } from '@skeletonlabs/skeleton-svelte';
	import type { FigureEditorState } from '../../state/editorState.svelte';
	import { menuContentClass, separatorClass } from '../../ui/menuStyles';
	import { historyCommands, runEditCommand, selectionCommands } from '../editCommands';
	import MenuBarItem from './MenuBarItem.svelte';
	import MenuBarTrigger from './MenuBarTrigger.svelte';
	import { shortcutText } from './shortcutText';

	type Props = { editor: FigureEditorState };
	const props: Props = $props();

	const commands = $derived([
		...historyCommands(),
		null,
		...selectionCommands(props.editor),
		null,
		{ value: 'select-all', label: 'Select all', shortcut: shortcutText('A') }
	]);
</script>

<Menu onSelect={(d) => runEditCommand(props.editor, d.value)}>
	<MenuBarTrigger label="Edit" />
	<Portal>
		<Menu.Positioner>
			<Menu.Content class={menuContentClass}>
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
