import { tick } from 'svelte';
import { prefsFocus } from './prefsFocus.svelte';
import { matchCounts, searchRows } from './prefsSearch';
import type { PrefsRowDef } from './prefsRows';
import { PREFS_TABS, tabUnavailable, type EditorSub, type PrefsTab } from './prefsTabs';

const AVAILABLE = PREFS_TABS.filter((t) => !tabUnavailable(t)).map((t) => t.id);

export class PrefsNavigation {
	tab = $state<PrefsTab>('appearance');
	query = $state('');
	scroller = $state<HTMLElement | null>(null);

	readonly searching = $derived(this.query.trim() !== '');
	readonly groups = $derived(this.searching ? searchRows(this.query, AVAILABLE) : []);
	readonly counts = $derived(matchCounts(this.groups));

	show(tab: PrefsTab): void {
		this.query = '';
		this.tab = tab;
	}

	showEditorSub(sub: EditorSub): void {
		this.show('editor');
		prefsFocus.editorSub = sub;
	}

	/** the tab and sub-tab of a row, scrolled to and flashed */
	async reveal(row: PrefsRowDef): Promise<void> {
		this.query = '';
		this.tab = row.tab;
		if (row.sub) prefsFocus.editorSub = row.sub;
		if (row.section === 'packages') prefsFocus.packagesOpen = true;
		await tick();
		await new Promise((resolve) => requestAnimationFrame(resolve));
		this.scroller?.querySelector(`[data-pref-row="${CSS.escape(row.id)}"]`)?.scrollIntoView({ block: 'center' });
		prefsFocus.flash(row.id);
	}

	/** the first group of a tab in the results */
	showGroupOf(tab: PrefsTab): void {
		this.scroller?.querySelector(`[data-prefs-group^="${tab}:"]`)?.scrollIntoView({ block: 'start' });
	}
}
