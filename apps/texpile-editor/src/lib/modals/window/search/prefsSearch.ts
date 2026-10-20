import { PREFS_ROWS, sectionLabel, type PrefsRowDef, type PrefsSectionId } from './prefsRows';
import { PREFS_TABS, tabLabel, type PrefsTab } from './prefsTabs';

export type PrefsSearchGroup = {
	tab: PrefsTab;
	title: string;
	sections: { id: PrefsSectionId | null; heading: string; rows: PrefsRowDef[] }[];
};

function plain(text: string): string {
	return text.normalize('NFD').replace(/\p{M}/gu, '').toLowerCase();
}

export function queryWords(query: string): string[] {
	return plain(query).split(/\s+/).filter(Boolean);
}

/** every word has to be in the label, the note, or the names of the row's tab and section */
export function rowMatches(row: PrefsRowDef, words: string[]): boolean {
	if (!words.length) return false;
	const text = plain([row.label(), row.note?.() ?? '', tabLabel(row.tab), row.section ? sectionLabel(row.section) : ''].join(' '));
	return words.every((w) => text.includes(w));
}

/** the rows that match, in the order of the tabs, then of the registry, grouped under tab and section */
export function searchRows(query: string, tabs: readonly PrefsTab[] = PREFS_TABS.map((t) => t.id)): PrefsSearchGroup[] {
	const words = queryWords(query);
	const groups: PrefsSearchGroup[] = [];
	for (const tab of tabs) {
		const rows = PREFS_ROWS.filter((r) => r.tab === tab && (r.shown?.() ?? true) && rowMatches(r, words));
		if (!rows.length) continue;
		const sections: PrefsSearchGroup['sections'] = [];
		for (const row of rows) {
			const id = row.section ?? null;
			let at = sections.find((s) => s.id === id);
			if (!at) sections.push((at = { id, heading: id ? sectionLabel(id) : '', rows: [] }));
			at.rows.push(row);
		}
		groups.push({ tab, title: tabLabel(tab), sections });
	}
	return groups;
}

export function matchCounts(groups: readonly PrefsSearchGroup[]): Map<PrefsTab, number> {
	const counts = new Map<PrefsTab, number>();
	for (const g of groups) counts.set(g.tab, (counts.get(g.tab) ?? 0) + g.sections.reduce((n, s) => n + s.rows.length, 0));
	return counts;
}
