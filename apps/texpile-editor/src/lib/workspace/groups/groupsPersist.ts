// The editor groups kept between sittings, in the folder's entry beside its tabs, as VS Code keeps its
// editor layout. The focused group's tabs stay in `tabs`, so a folder saved by one group reads as before
import { getFolder, updateFolder, type SavedGroup } from '$lib/storage/workspaces';
import { restoredTab, savedTabs, tabKey, type Tab } from '../tabs.svelte';

/** what a parked group comes back with */
export type RestoredGroup =
	{ focused: true; share: number } | { focused: false; share: number; tabs: Tab[]; active: Tab | null; mode: 'visual' | 'source' };

type GroupToSave = { focused: boolean; share: number; tabs: Tab[]; active: Tab | null; mode: 'visual' | 'source' };

export function saveGroups(root: string, groups: GroupToSave[]): void {
	updateFolder(root, (draft) => {
		draft.groups =
			groups.length < 2
				? undefined
				: groups.map((g): SavedGroup => {
						if (g.focused) return { focused: true, share: g.share };
						const key = g.active ? tabKey(g.active) : null;
						return { share: g.share, tabs: savedTabs(root, g.tabs), active: g.tabs.findIndex((t) => tabKey(t) === key), mode: g.mode };
					});
	});
}

/** null when there is nothing to restore, or the entry is not one this build reads */
export function loadGroups(root: string): RestoredGroup[] | null {
	const saved = getFolder(root).groups;
	if (!Array.isArray(saved) || saved.length < 2 || saved.filter((g) => g?.focused === true).length !== 1) return null;
	const out: RestoredGroup[] = [];
	for (const g of saved) {
		const share = typeof g?.share === 'number' && g.share > 0 ? g.share : 1;
		if (g.focused) {
			out.push({ focused: true, share });
			continue;
		}
		const tabs = Array.isArray(g.tabs) ? g.tabs.flatMap((t) => restoredTab(root, t) ?? []) : [];
		if (!tabs.length) continue;
		const mode = g.mode === 'source' ? 'source' : 'visual';
		out.push({ focused: false, share, tabs, active: tabs[g.active] ?? tabs[0], mode });
	}
	return out.length < 2 ? null : out;
}
