import { tick } from 'svelte';
import { prefsFocus } from './prefsFocus.svelte';
import { matchCounts, searchRows } from './prefsSearch';
import type { PrefsRowDef, PrefsSectionId } from './prefsRows';
import { PREFS_TABS, tabUnavailable, type PrefsTab } from './prefsTabs';

const AVAILABLE = PREFS_TABS.filter((t) => !tabUnavailable(t)).map((t) => t.id);

export class PrefsNavigation {
	tab = $state<PrefsTab>('appearance');
	query = $state('');
	scroller = $state<HTMLElement | null>(null);
	/** the heading the page is scrolled to, null above the first */
	section = $state<PrefsSectionId | null>(null);
	/** the pages whose headings are listed in the sidebar */
	expanded = $state<PrefsTab[]>(['appearance']);

	readonly searching = $derived(this.query.trim() !== '');
	readonly groups = $derived(this.searching ? searchRows(this.query, AVAILABLE) : []);
	readonly counts = $derived(matchCounts(this.groups));

	async show(tab: PrefsTab): Promise<void> {
		this.query = '';
		this.expanded = [tab];
		this.tab = tab;
		this.section = null;
		await tick();
		this.scroller?.scrollTo({ top: 0 });
	}

	toggle(tab: PrefsTab): void {
		this.expanded = this.expanded.includes(tab) ? this.expanded.filter((t) => t !== tab) : [...this.expanded, tab];
	}

	async showSection(tab: PrefsTab, section: PrefsSectionId): Promise<void> {
		await this.show(tab);
		await tick();
		this.#heading(section)?.scrollIntoView({ block: 'start' });
		this.section = section;
	}

	/** the last heading at or above the top of the page; at the bottom the one just chosen stays */
	trackSection(): void {
		const box = this.scroller;
		if (!box) return;
		const atBottom = box.scrollTop + box.clientHeight >= box.scrollHeight - 1;
		if (atBottom && this.section && this.#heading(this.section)) return;
		const top = box.getBoundingClientRect().top + 8;
		let current: PrefsSectionId | null = null;
		for (const h of box.querySelectorAll<HTMLElement>('[data-prefs-section]'))
			if (h.getBoundingClientRect().top <= top) current = h.dataset.prefsSection as PrefsSectionId;
		this.section = current;
	}

	/** the tab of a row, scrolled to and flashed */
	async reveal(row: PrefsRowDef): Promise<void> {
		await this.show(row.tab);
		if (row.section === 'packages') prefsFocus.packagesOpen = true;
		await tick();
		await new Promise((resolve) => requestAnimationFrame(resolve));
		this.scroller?.querySelector(`[data-pref-row="${CSS.escape(row.id)}"]`)?.scrollIntoView({ block: 'center' });
		prefsFocus.flash(row.id);
	}

	/** the group of a tab in the results */
	showGroupOf(tab: PrefsTab): void {
		this.scroller?.querySelector(`[data-prefs-group="${tab}"]`)?.scrollIntoView({ block: 'start' });
	}

	#heading(section: PrefsSectionId): HTMLElement | null | undefined {
		return this.scroller?.querySelector<HTMLElement>(`[data-prefs-section="${section}"]`);
	}
}
