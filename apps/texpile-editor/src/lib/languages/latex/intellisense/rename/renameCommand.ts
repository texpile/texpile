// F2 on a label, citation key or glossary entry: ask for the new name, then rename it across the document
import { keymap, type EditorView } from '@codemirror/view';
import { Prec, StateField, type Extension } from '@codemirror/state';
import { renameEverywhere } from '$lib/stores/editorStore';
import { renameProblemText } from '$lib/workspace/edits/renameNames';
import type { UseKind } from '$lib/workspace/edits/renameUses';
import { renameCard, openRenameCard } from '$lib/editor/source/rename/renameCardTooltip';
import { m } from '$lib/paraglide/messages';
import { renameTargetAt, type RenameTarget } from './renameTarget';

// present only in editors that mount latexRename(): not a .bib, not a Typst file
const renameMounted = StateField.define<true>({ create: () => true, update: (value) => value });

/** what the cursor can rename, or null where the editor takes no rename (read-only, no workspace) */
export function renameTargetOf(view: EditorView, pos = view.state.selection.main.head): RenameTarget | null {
	if (!view.state.field(renameMounted, false) || view.state.readOnly || !renameEverywhere.current) return null;
	return renameTargetAt(view.state, pos);
}

export function renameLabelOf(kind: UseKind): string {
	if (kind === 'label') return m.rename_symbol_label();
	return kind === 'cite' ? m.rename_symbol_citekey() : m.rename_symbol_glossary();
}

/** F2, the context menu and the palette: prompt for a new name for what the cursor is on */
export function renameAtCursor(view: EditorView, at?: number): boolean {
	const target = renameTargetOf(view, at);
	if (!target) return false;

	openRenameCard(view, {
		from: target.from,
		title: renameLabelOf(target.kind),
		name: target.name,
		problemOf: (name) => renameProblemText(target.kind, name),
		onRename: (name) => void renameEverywhere.current?.(target.kind, target.name, name)
	});
	return true;
}

export function latexRename(): Extension {
	return [renameMounted, renameCard, Prec.high(keymap.of([{ key: 'F2', run: (view) => renameAtCursor(view), preventDefault: true }]))];
}
