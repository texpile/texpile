// which tabs a close command from the tab menu takes, and how a tab's path is spelled for copying
import { tabKey, type Tab } from '$lib/workspace/tabs.svelte';
import { samePath } from '$lib/workspace/fileSystem';

export type CloseScope = 'others' | 'right' | 'saved' | 'all';

/** the focused tab comes last so focus moves once; a dirty focused file survives Close Saved */
export function tabsToClose(scope: CloseScope, tabs: Tab[], target: Tab, active: Tab | null, dirty: boolean): Tab[] {
	const key = tabKey(target);
	const activeKey = active ? tabKey(active) : null;
	const at = tabs.findIndex((t) => tabKey(t) === key);
	const picked = tabs.filter((t, i) => {
		if (scope === 'others') return tabKey(t) !== key;
		if (scope === 'right') return i > at;
		if (scope === 'saved') return !(dirty && active && !t.compare && samePath(t.path, active.path));
		return true;
	});
	return [...picked.filter((t) => tabKey(t) !== activeKey), ...picked.filter((t) => tabKey(t) === activeKey)];
}

/** the path from the workspace root down, or null when the file is not under it */
export function relativeTo(root: string | null, path: string): string | null {
	if (!root || path.length <= root.length || !samePath(path.slice(0, root.length), root)) return null;
	const rest = path.slice(root.length);
	if (!/[\\/]$/.test(root) && !/^[\\/]/.test(rest)) return null;
	return rest.replace(/^[\\/]/, '');
}
