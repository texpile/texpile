import { AlignLeft, BookMarked, Keyboard, Library } from '@lucide/svelte';
import { settings, updateSettings, type AppSettings } from '$lib/settings';
import type { PaletteActions } from '$lib/workspace/commandPalette.svelte';
import type { PaletteItem } from './paletteCommands';
import { m } from '$lib/paraglide/messages';

export function editorItems(a: PaletteActions): PaletteItem[] {
	const items: PaletteItem[] = [];
	const group = m.palette_group_editor();
	if (a.insertZoteroCitation && a.canZoteroCite?.())
		items.push({
			id: 'editor.zoteroCitation',
			label: m.zotero_insert_citation(),
			group,
			keywords: 'zotero cite citation bibliography reference bibtex import',
			icon: BookMarked,
			run: () => a.insertZoteroCitation?.()
		});
	if (a.insertLibraryCitation && a.canLibraryCite?.())
		items.push({
			id: 'editor.libraryCitation',
			label: m.library_insert_citation(),
			group,
			keywords: 'library cite citation bibliography reference bibtex import',
			icon: BookMarked,
			run: () => a.insertLibraryCitation?.()
		});
	if (a.openLibraryManager && a.canManageLibrary?.())
		items.push({
			id: 'editor.libraryManage',
			label: m.library_manage(),
			group,
			keywords: 'library reference bibtex bibliography manage edit entries',
			icon: Library,
			run: () => a.openLibraryManager?.()
		});
	if (a.hasFile() && a.canFormat())
		items.push({
			id: 'editor.format',
			label: m.menubar_format_document({ tool: a.formatTool() }),
			group,
			keywords: 'latexindent reindent tidy beautify',
			icon: AlignLeft,
			run: () => a.openFormatModal()
		});
	// keybindings are switched from here rather than only in Preferences: a vim user who lands in a
	// fresh install wants one keystroke to fix it, not a dialog
	const current = settings.current.editorKeymap ?? 'default';
	const keymapLabel: Record<AppSettings['editorKeymap'], string> = {
		default: m.prefs_keybindings_default(),
		vim: 'Vim',
		emacs: 'Emacs'
	};
	for (const km of ['default', 'vim', 'emacs'] as const) {
		if (km === current) continue;
		items.push({
			id: `editor.keymap.${km}`,
			label: m.palette_use_keymap({ name: keymapLabel[km] }),
			group,
			keywords: 'keybindings modal editing keymap',
			icon: Keyboard,
			run: () => updateSettings({ editorKeymap: km })
		});
	}
	return items;
}
