<script lang="ts">
	// Help > Keyboard shortcuts
	import { isMac } from '$lib/platform';
	import { shortcutsOpen } from '$lib/stores/dialogStore';
	import Modal from '../Modal.svelte';
	import { combo } from '$lib/chrome/shortcutText';
	import Kbd from '$lib/components/Kbd.svelte';
	import { m } from '$lib/paraglide/messages';

	const SHORTCUTS: { group: string; items: { keys: string; label: string }[] }[] = [
		{
			group: m.menubar_shortcut_group_general(),
			items: [
				{ keys: combo('K'), label: m.palette_open() },
				{ keys: combo('N', { shift: true }), label: m.menubar_new_window() },
				{ keys: combo('S'), label: m.menubar_save() },
				{ keys: combo('F'), label: m.menubar_shortcut_find_in_document() },
				{ keys: combo('F', { shift: true }), label: m.menubar_shortcut_find_in_files() },
				{ keys: combo('Z'), label: m.menubar_undo() },
				{ keys: combo('Z', { shift: true }), label: m.menubar_redo() }
			]
		},
		{
			group: m.menubar_shortcut_group_view(),
			items: [
				{ keys: isMac ? '⌘ +' : 'Ctrl +', label: m.menubar_shortcut_zoom_in_interface() },
				{ keys: isMac ? '⌘ −' : 'Ctrl −', label: m.menubar_shortcut_zoom_out_interface() },
				{ keys: isMac ? '⌘ 0' : 'Ctrl 0', label: m.menubar_shortcut_reset_interface_zoom() }
			]
		},
		{
			group: m.menubar_shortcut_group_compile(),
			items: [{ keys: combo('Enter', { alt: true }), label: m.menubar_shortcut_compile_toggle() }]
		},
		{
			group: m.menubar_shortcut_group_source_editor(),
			items: [
				{ keys: isMac ? 'F12 / ⌘ Click' : 'F12 / Ctrl+Click', label: m.menubar_shortcut_go_to_definition() },
				{ keys: isMac ? '⌃Space' : 'Ctrl+Space', label: m.menubar_shortcut_open_suggestions() },
				{ keys: 'Esc', label: m.menubar_shortcut_hide_math_preview() }
			]
		},
		{
			group: m.menubar_shortcut_group_formatting(),
			items: [
				{ keys: combo('B'), label: m.menubar_format_bold() },
				{ keys: combo('I'), label: m.menubar_format_italic() },
				{ keys: combo('U'), label: m.menubar_format_underline() },
				{ keys: combo('`'), label: m.menubar_format_inline_code() },
				{ keys: combo('.'), label: m.menubar_shortcut_superscript() },
				{ keys: combo(','), label: m.menubar_shortcut_subscript() },
				{ keys: combo('B', { shift: true }), label: m.menubar_format_blockquote() },
				{ keys: combo('`', { shift: true }), label: m.menubar_insert_code_block() },
				{
					keys: isMac
						? `${combo('1', { alt: true })} … ${combo('3', { alt: true })}`
						: `${combo('1', { shift: true })} … ${combo('3', { shift: true })}`,
					label: m.menubar_shortcut_heading_range()
				}
			]
		},
		{
			group: m.menubar_shortcut_group_math(),
			items: [
				{ keys: combo('M'), label: m.menubar_shortcut_inline_math() },
				{ keys: combo('M', { shift: true }), label: m.menubar_shortcut_display_math() }
			]
		}
	];
</script>

<Modal bind:open={shortcutsOpen.current} title={m.menubar_keyboard_shortcuts()}>
	<div class="max-h-[60vh] space-y-4 overflow-y-auto pr-1">
		{#each SHORTCUTS as grp (grp.group)}
			<div>
				<div class="text-muted mb-1.5 text-xs font-semibold tracking-wider uppercase">{grp.group}</div>
				<ul class="space-y-1">
					{#each grp.items as s (s.label)}
						<li class="flex items-center justify-between gap-4 text-sm">
							<span>{s.label}</span>
							<!-- raw, not keys: combo() has already resolved the per-OS symbols, and several
									     entries here are composites the parser cannot express ("F12 / ⌘ Click") -->
							<Kbd cap raw={s.keys} />
						</li>
					{/each}
				</ul>
			</div>
		{/each}
	</div>
</Modal>
