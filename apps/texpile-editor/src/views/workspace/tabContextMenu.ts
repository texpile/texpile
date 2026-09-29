import { Copy, FolderOpen, FolderTree, History, Pin, X } from '@lucide/svelte';
import { showContextMenu, type ContextMenuItem } from '$lib/menus/contextMenu.svelte';
import { tabKey, type Tab } from '$lib/workspace/tabs.svelte';
import { relativeTo, tabsToClose, type CloseScope } from './tabMenuTargets';
import { m } from '$lib/paraglide/messages';

export type TabMenuDeps = {
	tabs: Tab[];
	/** the focused tab, the only one that can hold unsaved edits */
	active: Tab | null;
	dirty: boolean;
	/** key of the unedited preview tab */
	preview: string | null;
	root: string | null;
	close: (tab: Tab) => void;
	keep: (tab: Tab) => void;
	/** select the file in the OS file manager; omitted outside the desktop shell */
	reveal?: (path: string) => void;
	showInTree?: (path: string) => void;
	/** the file's Local History; omitted for a guest, whose files are the host's */
	localHistory?: (path: string) => void;
};

function copy(text: string): void {
	void navigator.clipboard.writeText(text).catch(() => {});
}

export function openTabContextMenu(event: MouseEvent, tab: Tab, d: TabMenuDeps): void {
	event.preventDefault();
	event.stopPropagation();
	const key = tabKey(tab);
	const isActive = !!d.active && tabKey(d.active) === key;
	const at = d.tabs.findIndex((t) => tabKey(t) === key);
	function closing(scope: CloseScope): Tab[] {
		return tabsToClose(scope, d.tabs, tab, d.active, d.dirty);
	}
	function closeAll(scope: CloseScope): void {
		for (const t of closing(scope)) d.close(t);
	}
	const rel = relativeTo(d.root, tab.path);
	const items: ContextMenuItem[] = [
		{ label: m.tabs_close(), icon: X, keys: isActive ? 'Mod+W' : undefined, onclick: () => d.close(tab) },
		{ label: m.tabs_menu_close_others(), disabled: d.tabs.length < 2, onclick: () => closeAll('others') },
		{ label: m.tabs_menu_close_right(), disabled: at >= d.tabs.length - 1, onclick: () => closeAll('right') },
		{ label: m.tabs_menu_close_saved(), disabled: closing('saved').length === 0, onclick: () => closeAll('saved') },
		{ label: m.tabs_menu_close_all(), onclick: () => closeAll('all') },
		{ separator: true },
		{ label: m.tabs_menu_copy_path(), icon: Copy, onclick: () => copy(tab.path) }
	];
	if (rel !== null) items.push({ label: m.tabs_menu_copy_relative_path(), onclick: () => copy(rel) });
	const { reveal, showInTree, localHistory } = d;
	if (d.preview === key || reveal || showInTree || localHistory) items.push({ separator: true });
	if (d.preview === key) items.push({ label: m.tabs_menu_keep_open(), icon: Pin, onclick: () => d.keep(tab) });
	if (reveal) items.push({ label: m.filetree_menu_reveal(), icon: FolderOpen, onclick: () => reveal(tab.path) });
	if (showInTree) items.push({ label: m.tabs_menu_show_in_tree(), icon: FolderTree, onclick: () => showInTree(tab.path) });
	// a comparison tab is the file too: its history is the file's
	if (localHistory) items.push({ label: m.history_menu_open(), icon: History, onclick: () => localHistory(tab.path) });
	void showContextMenu(items, { x: event.clientX, y: event.clientY });
}
