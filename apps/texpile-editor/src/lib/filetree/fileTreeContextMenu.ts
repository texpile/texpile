// The file tree's right-click menu: what the tree can do to the row under the pointer, as items
// for the shared menu (lib/menus).
import { FilePlus, FolderPlus, FileSymlink, Star, Copy, ClipboardPaste, FolderOpen, Undo2, Redo2, Pencil, Trash2 } from '@lucide/svelte';
import type { TreeEntry } from '$lib/workspace/fileSystem';
import type { FileHistory } from '$lib/workspace/fileHistory.svelte';
import { showContextMenu, type ContextMenuItem } from '$lib/menus/contextMenu.svelte';
import { m } from '$lib/paraglide/messages';

export type TreeTarget = {
	entry: TreeEntry | null;
	createDir: string;
	pasteDir: string;
	/** rows Delete would take, so the label can say "Delete 3 items" */
	selectionCount: number;
	isMain: boolean;
	canSetMain: boolean;
	canPaste: boolean;
	canReveal: boolean;
};

export type TreeMenuDeps = {
	history?: FileHistory | null;
	/** #include instead of \\include in the hint */
	typstProject?: boolean;
	onCreate?: (dir: string, type: 'file' | 'dir' | 'include') => void;
	onSetMain?: (entry: TreeEntry) => void;
	onCopy?: () => void;
	onPaste?: (dir: string) => void;
	onReveal?: (entry: TreeEntry) => void;
	onRename?: (entry: TreeEntry) => void;
	onDelete?: (entry: TreeEntry) => void;
	/** the menu closed, chosen or not: the tree takes focus back */
	onClose?: () => void;
};

export function openFileTreeContextMenu(event: MouseEvent, at: TreeTarget, d: TreeMenuDeps): void {
	event.preventDefault();
	event.stopPropagation();
	const { entry, history } = at.entry ? { entry: at.entry, history: d.history } : { entry: null, history: d.history };
	const items: ContextMenuItem[] = [];
	if (!entry || entry.type === 'dir') {
		items.push(
			{ label: m.filetree_menu_new_file(), icon: FilePlus, onclick: () => d.onCreate?.(at.createDir, 'file') },
			{ label: m.filetree_menu_new_folder(), icon: FolderPlus, onclick: () => d.onCreate?.(at.createDir, 'dir') },
			{
				label: m.filetree_menu_new_include(),
				icon: FileSymlink,
				tip: d.typstProject ? m.filetree_new_include_hint_typst() : m.filetree_new_include_hint(),
				onclick: () => d.onCreate?.(at.createDir, 'include')
			}
		);
	}
	if (at.canSetMain && entry)
		items.push({
			label: at.isMain ? m.filetree_menu_unset_main() : m.filetree_menu_set_main(),
			icon: Star,
			onclick: () => d.onSetMain?.(entry)
		});
	if (entry) items.push({ label: m.filetree_menu_copy(), icon: Copy, onclick: () => d.onCopy?.() });
	if (at.canPaste) items.push({ label: m.filetree_menu_paste(), icon: ClipboardPaste, onclick: () => d.onPaste?.(at.pasteDir) });
	if (at.canReveal && entry) items.push({ label: m.filetree_menu_reveal(), icon: FolderOpen, onclick: () => d.onReveal?.(entry) });
	if (history && (history.canUndo || history.canRedo)) {
		// something always precedes this group: a file shows Copy, anywhere else the New File block
		items.push({ separator: true });
		if (history.canUndo)
			items.push({ label: m.filetree_menu_undo({ what: history.undoLabel ?? '' }), icon: Undo2, onclick: () => void history.undo() });
		if (history.canRedo)
			items.push({ label: m.filetree_menu_redo({ what: history.redoLabel ?? '' }), icon: Redo2, onclick: () => void history.redo() });
		// ...but a rule after it only when Rename/Delete follow, or empty space ends in a stray line
		if (entry) items.push({ separator: true });
	}
	if (entry) {
		if (at.selectionCount === 1) items.push({ label: m.filetree_rename(), icon: Pencil, onclick: () => d.onRename?.(entry) });
		items.push({
			label: at.selectionCount > 1 ? m.filetree_delete_many({ count: at.selectionCount }) : m.filetree_delete(),
			icon: Trash2,
			danger: true,
			onclick: () => d.onDelete?.(entry)
		});
	}
	void showContextMenu(items, { x: event.clientX, y: event.clientY }, { onClose: d.onClose });
}
