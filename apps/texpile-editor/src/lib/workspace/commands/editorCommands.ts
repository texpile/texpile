import { ensureGlobalSnippets, ensureProjectSnippets } from '$lib/editor/snippets/file/snippetLoader';
import { workspaceRoot } from '$lib/workspace/workspaceStore';
import { sourceCmView } from '$lib/stores/editorStore';
import { changedLines, nextChange, previousChange, revertChange, revertChangeAt } from '$lib/editor/source/cmChangeMarkers';
import { conflictBlocks, nextConflict, previousConflict } from '$lib/editor/source/cmConflicts';
import { renameLabelOf, renameTargetOf } from '$lib/languages/latex/intellisense/rename/renameCommand';
import { hasSourcePaste, showPasteAsMenu } from '$lib/editor/source/paste/cmSourcePaste';
import { settings, updateSettings } from '$lib/settings';
import type { CommandImpl } from '$lib/keybindings/commands/commandRegistry';
import type { PaletteActions } from '$lib/workspace/commandPalette.svelte';
import type { EditorView as CMView } from '@codemirror/view';
import { m } from '$lib/paraglide/messages';

function onView(step: (view: CMView) => unknown): () => void {
	return () => {
		const view = sourceCmView.current;
		if (!view) return;
		step(view);
		view.focus();
	};
}

function hasChanges(): boolean {
	return !!sourceCmView.current && changedLines(sourceCmView.current.state).length > 0;
}

function hasConflicts(): boolean {
	return !!sourceCmView.current && (sourceCmView.current.state.field(conflictBlocks, false) ?? []).length > 0;
}

export function editorCommands(a: PaletteActions): CommandImpl[] {
	function project(): boolean {
		return !!workspaceRoot.current && a.isProject() && a.isHostWorkspace();
	}
	function renaming() {
		return sourceCmView.current && a.renameSymbol ? renameTargetOf(sourceCmView.current) : null;
	}
	return [
		{
			id: 'editor.zoteroCitation',
			enabled: () => !!a.insertZoteroCitation && !!a.canZoteroCite?.(),
			run: () => a.insertZoteroCitation?.()
		},
		{ id: 'editor.citeByDoi', enabled: () => !!a.citeByDoi && !!a.canCiteByDoi?.(), run: () => a.citeByDoi?.() },
		{ id: 'editor.symbol', enabled: () => !!a.insertSymbol && !!a.canInsertSymbol?.(), run: () => a.insertSymbol?.() },
		{
			id: 'editor.format',
			enabled: () => a.hasFile() && a.canFormat(),
			title: () => m.menubar_format_document({ tool: a.formatTool() }),
			run: () => a.openFormatModal()
		},
		// the Paste As button's choices, for a paste not made yet
		{
			id: 'editor.pasteAs',
			enabled: () => !!sourceCmView.current && hasSourcePaste(sourceCmView.current.state) && !sourceCmView.current.state.readOnly,
			run: () => void (sourceCmView.current && showPasteAsMenu(sourceCmView.current))
		},
		{
			id: 'editor.renameSymbol',
			enabled: () => !!renaming(),
			title: () => {
				const target = renaming();
				return target ? renameLabelOf(target.kind) : m.keybindings_cmd_rename_symbol();
			},
			run: () => a.renameSymbol?.()
		},
		// the change bars' own keys, Alt+F5 and Shift+Alt+F5, found where people look for a command
		{ id: 'editor.nextChange', enabled: hasChanges, run: onView(nextChange) },
		{ id: 'editor.previousChange', enabled: hasChanges, run: onView(previousChange) },
		// the margin peek's Undo this change, for the change the caret is in
		{
			id: 'editor.revertChange',
			enabled: () => hasChanges() && !!revertChangeAt(sourceCmView.current!.state, sourceCmView.current!.state.selection.main.head),
			run: onView(revertChange)
		},
		{ id: 'editor.nextConflict', enabled: hasConflicts, run: onView(nextConflict) },
		{ id: 'editor.previousConflict', enabled: hasConflicts, run: onView(previousConflict) },
		{
			id: 'editor.projectSnippets',
			enabled: project,
			run: () => void ensureProjectSnippets(workspaceRoot.current!).then((path) => path && a.openFile(path))
		},
		{ id: 'editor.globalSnippets', run: () => void ensureGlobalSnippets().then((path) => path && a.openFile(path)) },
		...(['default', 'vim', 'emacs'] as const).map((km): CommandImpl => ({
			id: `editor.keymap.${km}`,
			enabled: () => (settings.current.editorKeymap ?? 'default') !== km,
			run: () => updateSettings({ editorKeymap: km })
		}))
	];
}
