import {
	AlignLeft,
	BookMarked,
	BookPlus,
	ClipboardPaste,
	Keyboard,
	Omega,
	ArrowDownToLine,
	ArrowUpToLine,
	Undo2,
	Braces
} from '@lucide/svelte';
import { ensureProjectSnippets, revealGlobalSnippets } from '$lib/editor/snippets/file/snippetLoader';
import { wrapSelection, wrapSnippetsFor } from '$lib/editor/snippets/cmSnippets';
import { savePackageFile } from '$lib/editor/snippets/file/savePackageFile';
import { reloadSnippets } from '$lib/editor/snippets/file/snippetLoader';
import { importLatexSuite } from '$lib/editor/snippets/import/importLatexSuite';
import { nativeBridge } from '$lib/workspace/fileSystem';
import { detectedPackages, isBundledPackage } from '$lib/languages/latex/intellisense/completion/packageData';
import { userPackage } from '$lib/languages/latex/intellisense/userPackages';
import { toaster } from '$lib/modals/toaster-svelte';
import { workspaceRoot } from '$lib/workspace/workspaceStore';
import { sourceCmView } from '$lib/stores/editorStore';
import { changedLines, nextChange, previousChange, revertChange, revertChangeAt } from '$lib/editor/source/cmChangeMarkers';
import { conflictBlocks, nextConflict, previousConflict } from '$lib/editor/source/cmConflicts';
import { hasSourcePaste, showPasteAsMenu } from '$lib/editor/source/paste/cmSourcePaste';
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
	if (a.insertSymbol && a.canInsertSymbol?.())
		items.push({
			id: 'editor.symbol',
			label: m.symbols_title(),
			group,
			keywords: 'typst latex sym emoji symbol character glyph unicode arrow greek letter shorthand detexify math',
			icon: Omega,
			run: () => a.insertSymbol?.()
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
	const view = sourceCmView.current;
	// the Paste As button's choices, for a paste not made yet
	if (view && hasSourcePaste(view.state) && !view.state.readOnly)
		items.push({
			id: 'editor.pasteAs',
			label: m.paste_as_command(),
			group,
			keywords: 'paste clipboard plain text table spreadsheet excel sheets link markdown formatting convert',
			icon: ClipboardPaste,
			run: () => void showPasteAsMenu(view)
		});
	// the change bars' own keys, Alt+F5 and Shift+Alt+F5, found where people look for a command
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
	if (view && !view.state.selection.main.empty)
		for (const c of wrapSnippetsFor(view.state))
			items.push({
				id: `editor.wrap.${c.snippet.name}`,
				label: m.wrap_with_item({ name: c.snippet.name }),
				group,
				keywords: `wrap function call snippet selection ${c.snippet.wrap ?? ''}`,
				icon: Braces,
				run: () => wrapSelection(view, c)
			});
	const root = workspaceRoot.current;
	if (root && a.isProject() && a.isHostWorkspace())
		items.push({
			id: 'editor.projectSnippets',
			label: m.palette_project_snippets(),
			group,
			keywords: 'snippets snippet trigger expand template shortcut latex suite wrap function texpile',
			icon: Braces,
			run: () => void ensureProjectSnippets(root).then((path) => path && a.openFile(path))
		});
	if (root && a.isProject() && a.isHostWorkspace() && nativeBridge()?.pickFile)
		items.push({
			id: 'editor.importLatexSuite',
			label: m.palette_import_latex_suite(),
			group,
			keywords: 'snippets import latex suite obsidian convert',
			icon: Braces,
			run: () => void importLatexSuite(root, (path) => a.openFile(path))
		});
	// a package Texpile has no data for gets a starting file drafted from its .sty
	if (view && root && a.isProject() && a.isHostWorkspace())
		for (const name of [...detectedPackages(view.state.doc.toString())].filter((n) => !isBundledPackage(n) && !userPackage(n)).slice(0, 10))
			items.push({
				id: `editor.packageFile.${name}`,
				label: m.palette_save_package_file({ name }),
				group,
				keywords: 'package completion intellisense commands sty usepackage json latex workshop',
				icon: Braces,
				run: () =>
					void savePackageFile(root, name).then((path) => {
						if (!path) return toaster.info({ title: m.package_file_missing({ name }) });
						void reloadSnippets(root);
						a.openFile(path);
					})
			});
	items.push({
		id: 'editor.globalSnippets',
		label: m.palette_global_snippets(),
		group,
		keywords: 'snippets snippet trigger expand template shortcut latex suite wrap function all folders',
		icon: Braces,
		run: () => void revealGlobalSnippets()
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
