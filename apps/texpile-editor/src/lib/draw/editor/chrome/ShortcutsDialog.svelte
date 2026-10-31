<script lang="ts">
	import { m } from '$lib/paraglide/messages';
	import type { FigureEditorState } from '../state/editorState.svelte';
	import { ALL_TOOLS, isOffered } from '../tools/tools';
	import Kbd from '$lib/components/Kbd.svelte';
	import Modal from '../ui/Modal.svelte';
	import { redoShortcutText, shortcutText } from './menubar/shortcutText';

	type Props = { editor: FigureEditorState };
	const props: Props = $props();

	const shortcuts: { group: string; items: { keys: string; label: string }[] }[] = $derived([
		{
			group: m.figure_shortcuts_tools(),
			items: [
				...ALL_TOOLS.filter((t) => isOffered(t, props.editor.language)).map((t) => ({
					keys: t.digit ? `${t.key} ${t.digit}` : t.key,
					label: t.name()
				})),
				{ keys: 'Q', label: m.figure_tool_keep() },
				{ keys: 'Tab', label: m.figure_shortcut_type_size() },
				...(props.editor.language.features.includes('library') ? [{ keys: 'I', label: m.figure_shortcut_library() }] : [])
			]
		},
		{
			group: m.figure_shortcuts_edit(),
			items: [
				{ keys: shortcutText('Z'), label: m.figure_cmd_undo() },
				{ keys: redoShortcutText(), label: m.figure_cmd_redo() },
				{ keys: shortcutText('D'), label: m.figure_cmd_duplicate() },
				{ keys: 'Del', label: m.figure_cmd_delete() },
				{ keys: shortcutText('A'), label: m.figure_cmd_select_all() },
				{ keys: '← ↑ → ↓', label: m.figure_shortcut_nudge() },
				{ keys: shortcutText('G'), label: m.figure_cmd_group() },
				{ keys: shortcutText('G', { shift: true }), label: m.figure_cmd_ungroup() },
				{ keys: shortcutText(']'), label: m.figure_cmd_forward() },
				{ keys: shortcutText('['), label: m.figure_cmd_backward() },
				{ keys: shortcutText('L', { shift: true }), label: m.figure_cmd_lock() },
				{ keys: 'Esc', label: m.figure_shortcut_escape() }
			]
		},
		{
			group: m.figure_shortcuts_nodes(),
			items: [
				{ keys: 'Enter', label: m.figure_shortcut_type_text() },
				{ keys: 'Tab', label: m.figure_shortcut_change_outline() },
				{ keys: shortcutText('→'), label: m.figure_shortcut_next_step() },
				{ keys: shortcutText('→', { mod: false, alt: true }), label: m.figure_shortcut_go_joined() }
			]
		},
		{
			group: m.figure_shortcuts_view(),
			items: [
				{ keys: shortcutText('+'), label: m.figure_zoom_in() },
				{ keys: shortcutText('-'), label: m.figure_zoom_out() },
				{ keys: shortcutText('0'), label: m.figure_shortcut_zoom_100() },
				{ keys: shortcutText('1', { mod: false, shift: true }), label: m.figure_zoom_fit() },
				{ keys: shortcutText('2', { mod: false, shift: true }), label: m.figure_shortcut_fit_selection() },
				{ keys: 'Space', label: m.figure_shortcut_pan() },
				{ keys: shortcutText("'"), label: m.figure_shortcut_grid() },
				{ keys: '?', label: m.figure_shortcuts_title() }
			]
		}
	]);
</script>

<Modal open={props.editor.shortcutsShown} title={m.figure_shortcuts_title()} onclose={() => (props.editor.shortcutsShown = false)}>
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
