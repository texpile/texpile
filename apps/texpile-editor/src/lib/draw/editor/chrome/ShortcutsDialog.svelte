<script lang="ts">
	import type { FigureEditorState } from '../state/editorState.svelte';
	import { ALL_TOOLS, isOffered } from '../tools/tools';
	import Kbd from '../ui/Kbd.svelte';
	import Modal from '../ui/Modal.svelte';
	import { redoShortcutText, shortcutText } from './menubar/shortcutText';

	type Props = { editor: FigureEditorState };
	const props: Props = $props();

	const shortcuts: { group: string; items: { keys: string; label: string }[] }[] = $derived([
		{
			group: 'Tools',
			items: [
				...ALL_TOOLS.filter((t) => isOffered(t, props.editor.language)).map((t) => ({
					keys: t.digit ? `${t.key} ${t.digit}` : t.key,
					label: t.label.split(',')[0]
				})),
				{ keys: 'Q', label: 'Keep the tool after drawing' },
				{ keys: 'Tab', label: 'While drawing by clicks, type a size, then Tab to the next' },
				...(props.editor.language.features.includes('library') ? [{ keys: 'I', label: 'Library of shapes, math, solids and plots' }] : [])
			]
		},
		{
			group: 'Edit',
			items: [
				{ keys: shortcutText('Z'), label: 'Undo' },
				{ keys: redoShortcutText(), label: 'Redo' },
				{ keys: shortcutText('D'), label: 'Duplicate' },
				{ keys: 'Del', label: 'Delete' },
				{ keys: shortcutText('A'), label: 'Select all' },
				{ keys: '← ↑ → ↓', label: 'Move by a small step, with Shift by the grid' },
				{ keys: shortcutText('G'), label: 'Group' },
				{ keys: shortcutText('G', { shift: true }), label: 'Ungroup' },
				{ keys: shortcutText(']'), label: 'Bring forward' },
				{ keys: shortcutText('['), label: 'Send backward' },
				{ keys: shortcutText('L', { shift: true }), label: 'Lock' },
				{ keys: 'Esc', label: 'Back to Select, then out of a group' }
			]
		},
		{
			group: 'Nodes',
			items: [
				{ keys: 'Enter', label: 'Type the text' },
				{ keys: 'Tab', label: 'Change the outline' },
				{ keys: shortcutText('→'), label: 'Add the next step on that side' },
				{ keys: shortcutText('→', { mod: false, alt: true }), label: 'Go to a node joined to it' }
			]
		},
		{
			group: 'View',
			items: [
				{ keys: shortcutText('+'), label: 'Zoom in' },
				{ keys: shortcutText('-'), label: 'Zoom out' },
				{ keys: shortcutText('0'), label: 'Zoom to 100%' },
				{ keys: shortcutText('1', { mod: false, shift: true }), label: 'Fit the sheet' },
				{ keys: shortcutText('2', { mod: false, shift: true }), label: 'Fit the selection' },
				{ keys: 'Space', label: 'Hold and drag to move the view' },
				{ keys: shortcutText("'"), label: 'Grid' },
				{ keys: '?', label: 'Keyboard shortcuts' }
			]
		}
	]);
</script>

<Modal open={props.editor.shortcutsShown} title="Keyboard shortcuts" onclose={() => (props.editor.shortcutsShown = false)}>
	<div class="max-h-[60vh] space-y-4 overflow-y-auto pr-1">
		{#each shortcuts as group (group.group)}
			<div>
				<div class="text-muted mb-1.5 text-xs font-semibold tracking-wider uppercase">{group.group}</div>
				<ul class="space-y-1">
					{#each group.items as s (s.label)}
						<li class="flex items-center justify-between gap-4 text-sm">
							<span>{s.label}</span>
							<Kbd keys={s.keys} />
						</li>
					{/each}
				</ul>
			</div>
		{/each}
	</div>
</Modal>
