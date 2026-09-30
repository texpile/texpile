// The symbol picker's state: one picker for the window, showing the symbols of the document's own
// language, opened from the source toolbar, the Insert menu and the command palette alike, and
// inserting where the caret was when it opened.
import { editorViewStore, sourceCmView, viewMode } from '$lib/stores/editorStore';
import type { PickerSymbol, SymbolCatalog, SymbolSet, SymbolTarget } from './symbolPicker.types';

/** tiles per row; the arrow keys move by it, so the grid is laid out at exactly this */
export const SYMBOL_COLUMNS = 10;
// past this the matches are too loose to be worth scrolling through
const MAX_SEARCH_RESULTS = 200;

export const RECENT_TAB = 'recent';

function editorTarget(): SymbolTarget | null {
	if (viewMode.current === 'source') {
		const cm = sourceCmView.current;
		return cm && cm.dom.isConnected ? { kind: 'source', view: cm } : null;
	}
	const pm = editorViewStore.current;
	return pm && pm.dom.isConnected ? { kind: 'visual', view: pm } : null;
}

class SymbolPickerState {
	open = $state(false);
	query = $state('');
	tab = $state(RECENT_TAB);
	active = $state(0);
	set = $state.raw<SymbolSet<PickerSymbol> | null>(null);
	catalog = $state.raw<SymbolCatalog<PickerSymbol> | null>(null);
	/** read, never rendered: where the caret was when the picker opened */
	private target: SymbolTarget | null = null;
	private catalogs = new Map<SymbolSet<PickerSymbol>, SymbolCatalog<PickerSymbol>>();

	readonly recent = $derived.by((): readonly PickerSymbol[] => {
		const { set, catalog } = this;
		if (!set || !catalog) return [];
		return set
			.recent()
			.map(catalog.byId)
			.filter((s): s is PickerSymbol => s !== undefined);
	});

	readonly tabs = $derived.by((): readonly string[] => {
		const groups = this.set?.groups() ?? [];
		return this.recent.length > 0 ? [RECENT_TAB, ...groups] : groups;
	});

	readonly results = $derived.by((): readonly PickerSymbol[] => {
		const { set, catalog } = this;
		if (!set || !catalog) return [];
		if (this.query.trim()) return set.search(catalog.list, this.query, set.recent()).slice(0, MAX_SEARCH_RESULTS);
		if (this.tab === RECENT_TAB) return this.recent;
		const tab = this.tab;
		return catalog.list.filter((s) => s.group === tab);
	});

	readonly activeSymbol = $derived<PickerSymbol | null>(this.results[this.active] ?? null);

	async show<S extends PickerSymbol>(set: SymbolSet<S>): Promise<void> {
		const target = editorTarget();
		if (!target) return;
		const erased = set as unknown as SymbolSet<PickerSymbol>;
		let catalog = this.catalogs.get(erased);
		if (!catalog) {
			catalog = (await set.load()) as SymbolCatalog<PickerSymbol>;
			this.catalogs.set(erased, catalog);
		}
		this.set = erased;
		this.catalog = catalog;
		this.target = target;
		this.query = '';
		this.active = 0;
		this.tab = this.recent.length > 0 ? RECENT_TAB : (erased.groups()[0] ?? RECENT_TAB);
		this.open = true;
	}

	/** close without inserting, the caret back where it was */
	close(): void {
		const target = this.target;
		this.open = false;
		this.target = null;
		target?.view.focus();
	}

	search(query: string): void {
		this.query = query;
		this.active = 0;
	}

	selectTab(tab: string): void {
		this.tab = tab;
		this.query = '';
		this.active = 0;
	}

	tabLabel(tab: string, recentLabel: string): string {
		return tab === RECENT_TAB ? recentLabel : (this.set?.groupLabel(tab) ?? tab);
	}

	choose(symbol: PickerSymbol): void {
		const { target, set } = this;
		this.open = false;
		this.target = null;
		if (!set || !target || !target.view.dom.isConnected) return;
		set.insert(target, symbol);
		set.remember(symbol.id);
	}

	insertionText(symbol: PickerSymbol): string {
		const { target, set } = this;
		return set && target ? set.insertionText(target, symbol) : '';
	}
}

export const symbolPicker = new SymbolPickerState();
