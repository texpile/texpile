import { AlignLeft, BookMarked, BookPlus, Keyboard, ArrowDownToLine, ArrowUpToLine, Undo2 } from '@lucide/svelte';
import { sourceCmView } from '$lib/stores/editorStore';
import { changedLines, nextChange, previousChange, revertChange, revertChangeAt } from '$lib/editor/source/cmChangeMarkers';
import { conflictBlocks, nextConflict, previousConflict } from '$lib/editor/source/cmConflicts';
import { isMac } from '$lib/platform';
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
	if (a.citeByDoi && a.canCiteByDoi?.())
		items.push({
			id: 'editor.citeByDoi',
			label: m.cite_doi_insert(),
			group,
			keywords: 'doi arxiv isbn pubmed pmid title search find cite citation bibliography reference bibtex crossref paper book',
			icon: BookPlus,
			run: () => a.citeByDoi?.()
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
	// the change bars' own keys, Alt+F5 and Shift+Alt+F5, found where people look for a command
	const view = sourceCmView.current;
	if (view && changedLines(view.state).length) {
		for (const [id, label, step, icon, shift] of [
			['editor.nextChange', m.palette_next_change(), nextChange, ArrowDownToLine, false],
			['editor.previousChange', m.palette_previous_change(), previousChange, ArrowUpToLine, true]
		] as const)
			items.push({
				id,
				label,
				group,
				keywords: 'diff git change version modified line',
				hint: isMac ? `${shift ? '⇧' : ''}⌥F5` : `${shift ? 'Shift+' : ''}Alt+F5`,
				icon,
				run: () => {
					step(view);
					view.focus();
				}
			});
		// the margin peek's Undo this change, for the change the caret is in
		if (revertChangeAt(view.state, view.state.selection.main.head))
			items.push({
				id: 'editor.revertChange',
				label: m.palette_undo_change(),
				group,
				keywords: 'revert discard change git version line hunk',
				icon: Undo2,
				run: () => {
					revertChange(view);
					view.focus();
				}
			});
	}
	// the places a merge marked, where there are any
	if (view && (view.state.field(conflictBlocks, false) ?? []).length) {
		for (const [id, label, step, icon] of [
			['editor.nextConflict', m.palette_next_conflict(), nextConflict, ArrowDownToLine],
			['editor.previousConflict', m.palette_previous_conflict(), previousConflict, ArrowUpToLine]
		] as const)
			items.push({
				id,
				label,
				group,
				keywords: 'merge conflict combine both versions marked place',
				icon,
				run: () => {
					step(view);
					view.focus();
				}
			});
	}
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
