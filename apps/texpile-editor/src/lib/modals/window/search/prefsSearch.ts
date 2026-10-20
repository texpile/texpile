import { PREFS_ROWS, sectionLabel, type PrefsRowDef, type PrefsSectionId } from './prefsRows';
import { EDITOR_SUBS, PREFS_TABS, editorSubLabel, tabLabel, type EditorSub, type PrefsTab } from './prefsTabs';

export type PrefsSearchGroup = {
	key: string;
	tab: PrefsTab;
	sub?: EditorSub;
	title: string;
	sections: { id: PrefsSectionId | null; heading: string; rows: PrefsRowDef[] }[];
};

function plain(text: string): string {
	return text.normalize('NFD').replace(/\p{M}/gu, '').toLowerCase();
}

export function queryWords(query: string): string[] {
	return plain(query).split(/\s+/).filter(Boolean);
}

/** every word has to be in the label, the note, or the names of the row's tab, sub-tab and section */
export function rowMatches(row: PrefsRowDef, words: string[]): boolean {
	if (!words.length) return false;
	const text = plain(
		[
			row.label(),
			row.note?.() ?? '',
			tabLabel(row.tab),
			row.sub ? editorSubLabel(row.sub) : '',
			row.section ? sectionLabel(row.section) : ''
		].join(' ')
	);
	return words.every((w) => text.includes(w));
}

/** the rows that match, in the order of the tabs, then of the registry, grouped under tab, sub-tab and section */
export function searchRows(query: string, tabs: readonly PrefsTab[] = PREFS_TABS.map((t) => t.id)): PrefsSearchGroup[] {
	const words = queryWords(query);
	const groups: PrefsSearchGroup[] = [];
	const subs = EDITOR_SUBS.map((s) => s.id);
	for (const tab of tabs) {
		const inTab = PREFS_ROWS.filter((r) => r.tab === tab && (r.shown?.() ?? true) && rowMatches(r, words));
		for (const sub of tab === 'editor' ? subs : [undefined]) {
			const rows = inTab.filter((r) => r.sub === sub);
			if (!rows.length) continue;
			const sections: PrefsSearchGroup['sections'] = [];
			for (const row of rows) {
				const id = row.section ?? null;
				let at = sections.find((s) => s.id === id);
				if (!at) sections.push((at = { id, heading: id ? sectionLabel(id) : '', rows: [] }));
				at.rows.push(row);
			}
			groups.push({
				key: `${tab}:${sub ?? ''}`,
				tab,
				sub,
				title: sub ? `${tabLabel(tab)} › ${editorSubLabel(sub)}` : tabLabel(tab),
				sections
			});
		}
	}
	return groups;
}

export function matchCounts(groups: readonly PrefsSearchGroup[]): Map<PrefsTab, number> {
	const counts = new Map<PrefsTab, number>();
	for (const g of groups) counts.set(g.tab, (counts.get(g.tab) ?? 0) + g.sections.reduce((n, s) => n + s.rows.length, 0));
	return counts;
}
