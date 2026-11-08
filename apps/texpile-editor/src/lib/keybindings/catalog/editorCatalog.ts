import {
	AlignLeft,
	ArrowDownToLine,
	ArrowUpToLine,
	BookMarked,
	BookPlus,
	Braces,
	ClipboardPaste,
	Keyboard,
	Omega,
	TextCursorInput,
	Undo2,
	FoldVertical,
	UnfoldVertical
} from '@lucide/svelte';
import { m } from '$lib/paraglide/messages';
import type { CommandInfo } from '../commands/commandRegistry';

function category(): string {
	return m.palette_group_editor();
}
const change = 'diff git change version modified line';
const conflict = 'merge conflict combine both versions marked place';
const keymapNames = { default: () => m.prefs_keybindings_default(), vim: () => 'Vim', emacs: () => 'Emacs' };

export const EDITOR_COMMANDS: CommandInfo[] = [
	{
		id: 'editor.zoteroCitation',
		title: () => m.zotero_insert_citation(),
		category,
		palette: { keywords: 'zotero cite citation bibliography reference bibtex import', icon: BookMarked }
	},
	{
		id: 'editor.citeByDoi',
		title: () => m.cite_doi_insert(),
		category,
		palette: {
			keywords: 'doi arxiv isbn pubmed pmid title search find cite citation bibliography reference bibtex crossref paper book',
			icon: BookPlus
		}
	},
	{
		id: 'editor.symbol',
		title: () => m.symbols_title(),
		category,
		palette: { keywords: 'typst latex sym emoji symbol character glyph unicode arrow greek letter shorthand detexify math', icon: Omega }
	},
	{
		id: 'editor.format',
		title: () => m.keybindings_cmd_format_document(),
		category,
		palette: { keywords: 'latexindent reindent tidy beautify', icon: AlignLeft }
	},
	{
		id: 'editor.pasteAs',
		title: () => m.paste_as_command(),
		category,
		palette: {
			keywords: 'paste clipboard plain text table spreadsheet excel sheets link markdown formatting convert',
			icon: ClipboardPaste
		}
	},
	{
		id: 'editor.foldEquations',
		title: () => m.fold_cmd_equations(),
		category,
		palette: { keywords: 'collapse hide math formula align display', icon: FoldVertical }
	},
	{
		id: 'editor.unfoldEquations',
		title: () => m.fold_cmd_unfold_equations(),
		category,
		palette: { keywords: 'expand show math formula align display', icon: UnfoldVertical }
	},
	{
		id: 'editor.foldFiguresAndTables',
		title: () => m.fold_cmd_floats(),
		category,
		palette: { keywords: 'collapse hide figure table float tabular', icon: FoldVertical }
	},
	{
		id: 'editor.unfoldFiguresAndTables',
		title: () => m.fold_cmd_unfold_floats(),
		category,
		palette: { keywords: 'expand show figure table float tabular', icon: UnfoldVertical }
	},
	{
		id: 'editor.renameSymbol',
		title: () => m.keybindings_cmd_rename_symbol(),
		category,
		palette: { keywords: 'rename label citation key cite glossary acronym entry reference refactor everywhere', icon: TextCursorInput }
	},
	{ id: 'editor.nextChange', title: () => m.palette_next_change(), category, palette: { keywords: change, icon: ArrowDownToLine } },
	{ id: 'editor.previousChange', title: () => m.palette_previous_change(), category, palette: { keywords: change, icon: ArrowUpToLine } },
	{
		id: 'editor.revertChange',
		title: () => m.palette_undo_change(),
		category,
		palette: { keywords: 'revert discard change git version line hunk', icon: Undo2 }
	},
	{ id: 'editor.nextConflict', title: () => m.palette_next_conflict(), category, palette: { keywords: conflict, icon: ArrowDownToLine } },
	{
		id: 'editor.previousConflict',
		title: () => m.palette_previous_conflict(),
		category,
		palette: { keywords: conflict, icon: ArrowUpToLine }
	},
	{
		id: 'editor.projectSnippets',
		title: () => m.palette_project_snippets(),
		category,
		palette: { keywords: 'snippets snippet trigger expand template shortcut latex suite texpile', icon: Braces }
	},
	{
		id: 'editor.globalSnippets',
		title: () => m.palette_global_snippets(),
		category,
		palette: { keywords: 'snippets snippet trigger expand template shortcut latex suite all folders', icon: Braces }
	},
	// switched from here rather than only in Preferences: a vim user who lands in a fresh install wants one keystroke
	// to fix it, not a dialog
	...(['default', 'vim', 'emacs'] as const).map((km): CommandInfo => ({
		id: `editor.keymap.${km}`,
		title: () => m.palette_use_keymap({ name: keymapNames[km]() }),
		category,
		palette: { keywords: 'keybindings modal editing keymap', icon: Keyboard }
	}))
];
