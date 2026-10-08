// The editor layout kept between sittings, in the folder's entry beside its tabs, as VS Code keeps its
// editor layout. The focused slot's tabs stay in `tabs`, so a folder saved with one editor reads as before
import { getFolder, updateFolder, type SavedSlot } from '$lib/storage/workspaces';
import { restoredTab, savedTabs, tabKey, type Tab } from '../tabs.svelte';
import { LAYOUTS, slotCount, type EditorLayout } from './layouts';

type EditMode = 'visual' | 'source';

/** what a parked slot comes back with */
export type RestoredSlot = { focused: true; mode: EditMode } | { focused: false; tabs: Tab[]; active: Tab | null; mode: EditMode };

export type DividerSplit = { column: number; row: number };

export type RestoredLayout = { layout: EditorLayout; split: DividerSplit; slots: RestoredSlot[] };

type SlotToSave = { focused: boolean; tabs: Tab[]; active: Tab | null; mode: EditMode };

export function saveGroups(root: string, layout: EditorLayout, split: DividerSplit, slots: SlotToSave[]): void {
	updateFolder(root, (draft) => {
		draft.groups =
			layout === 'one'
				? undefined
				: {
						layout,
						split: { ...split },
						slots: slots.map((g): SavedSlot => {
							if (g.focused) return { focused: true, mode: g.mode };
							const key = g.active ? tabKey(g.active) : null;
							return { tabs: savedTabs(root, g.tabs), active: g.tabs.findIndex((t) => tabKey(t) === key), mode: g.mode };
						})
					};
	});
}

function restoredSlot(root: string, g: unknown): RestoredSlot | null {
	if (!g || typeof g !== 'object') return null;
	const raw = g as { focused?: unknown; tabs?: unknown; active?: unknown; mode?: unknown };
	const mode = raw.mode === 'source' ? 'source' : 'visual';
	if (raw.focused === true) return { focused: true, mode };
	const tabs = Array.isArray(raw.tabs) ? raw.tabs.flatMap((t) => restoredTab(root, t) ?? []) : [];
	const active = typeof raw.active === 'number' ? (tabs[raw.active] ?? tabs[0] ?? null) : (tabs[0] ?? null);
	return { focused: false, tabs, active, mode };
}

function part(v: unknown): number {
	return typeof v === 'number' && v > 0 && v < 1 ? v : 0.5;
}

/** the free row of groups this build replaced: its first two side by side, keeping the focused one */
function fromGroupRow(root: string, row: unknown[]): RestoredLayout | null {
	const focusedAt = row.findIndex((g) => (g as { focused?: unknown })?.focused === true);
	if (row.length < 2 || focusedAt < 0) return null;
	const picked = focusedAt < 2 ? row.slice(0, 2) : [row[0], row[focusedAt]];
	const slots = picked.map((g) => restoredSlot(root, g));
	if (slots.some((g) => !g)) return null;
	const [a, b] = picked.map((g) => (g as { share?: unknown }).share);
	const column = typeof a === 'number' && typeof b === 'number' && a > 0 && b > 0 ? a / (a + b) : 0.5;
	return { layout: 'columns', split: { column, row: 0.5 }, slots: slots as RestoredSlot[] };
}

/** null when there is nothing to restore, or the entry is not one this build reads */
export function loadGroups(root: string): RestoredLayout | null {
	const saved: unknown = getFolder(root).groups;
	if (Array.isArray(saved)) return fromGroupRow(root, saved);
	if (!saved || typeof saved !== 'object') return null;
	const raw = saved as { layout?: unknown; split?: { column?: unknown; row?: unknown }; slots?: unknown };
	const layout = LAYOUTS.find((l) => l === raw.layout);
	if (!layout || !Array.isArray(raw.slots) || raw.slots.length !== slotCount(layout)) return null;
	const slots = raw.slots.map((g) => restoredSlot(root, g));
	if (slots.some((g) => !g) || slots.filter((g) => g?.focused).length !== 1) return null;
	return { layout, split: { column: part(raw.split?.column), row: part(raw.split?.row) }, slots: slots as RestoredSlot[] };
}
