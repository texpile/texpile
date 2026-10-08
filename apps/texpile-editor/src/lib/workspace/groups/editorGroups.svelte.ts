// Editor groups in VS Code's fixed layouts: one editor, two side by side, two stacked or four in a grid,
// each slot with its own tabs and open file. The focused slot is the one the workspace runs on
// (activeFilePath, `tabs`, the editor stores); the others keep their editor on screen, parked
import { tabs, tabKey, TabsStore, type Tab } from '../tabs.svelte';
import { samePath } from '../fileSystem';
import { activeFilePath, openFileElsewhere } from '../workspaceStore';
import { browser } from '$lib/runtime';
import { loadGroups, saveGroups, type DividerSplit } from './groupsPersist';
import { cellOf, relayout, shrunkLayout, slotCount, type EditorLayout } from './layouts';
import { moveFile, type FileParser } from './fileFeed.svelte';
import { MIN_ROW_PX, movedDivider } from './groupSizes';
import type { EditMode } from '../viewModeSwitch.svelte';
import type { Node as PMNode } from 'prosemirror-model';

/** the props an editor pane is drawn with; the groups only keep them, the pane reads them */
export type FrozenPane = Record<string, unknown>;

/** what the workspace hands the groups: its live editor state, and the way into another file */
export type GroupHost = {
	/** the props the focused editor is drawn with right now */
	capture(): FrozenPane;
	activeTab(): Tab | null;
	mode(): EditMode;
	/** a folder reopened with its layout: the focused slot's own mode, before its file opens */
	setMode(mode: EditMode): void;
	/** focus moves to a group: its view mode, then its tab; `own` is the document its editor shows */
	enter(tab: Tab | null, mode: EditMode, own: GroupOwnDoc | null): void;
	/** another file's text as a visual document, put up nowhere while it parses */
	parseFile: FileParser;
	/** before a slot opens the focused file: the caret saved and the document up to date, so it opens where this one is */
	beforeSplit(): void;
	/** the caret beforeSplit saved, put back in the focused editor */
	placeSplitCaret(): void;
};

/** a parked slot's own editor document, and the props it is drawn with, whose text and map are of it */
export type GroupOwnDoc = { doc: PMNode; shown: FrozenPane };

export type EditorGroup = {
	id: number;
	/** a parked group's tabs; the focused group's are in `tabs` */
	tabs: TabsStore | null;
	/** how the group was drawn when focus left it */
	frozen: FrozenPane | null;
	active: Tab | null;
	mode: EditMode;
	/** restored with the folder and not drawn yet: it has no snapshot to show */
	unseen?: boolean;
	/** in a window of its own, with its one file and no strip; where on the screen it opened */
	window?: { x: number; y: number };
	/** opened by a split on the focused file and not focused since: it takes that one's caret when it first is */
	split?: boolean;
};

class EditorGroups {
	layout = $state<EditorLayout>('one');
	split = $state<DividerSplit>({ column: 0.5, row: 0.5 });
	// raw: a snapshot holds whole documents and source maps, which a deep proxy would wrap; replaced, never mutated
	list = $state.raw<EditorGroup[]>([{ id: 1, tabs: null, frozen: null, active: null, mode: 'visual' }]);
	focusedId = $state(1);
	/** the slot in this window that was focused last: what the folder keeps while a window of its own has focus */
	private homeId = 1;
	/** a slot focused from the keyboard, whose editor takes the keyboard once it is drawn */
	keyboardFocus = $state<number | null>(null);
	/** where each row of slots starts, from the top of the editor column, as drawn, and their heights */
	rowTops = $state<number[]>([0]);
	rowSizes: number[] = [];
	/** the editor column's height; a split preview of another height (the terminal under the editors only) keeps its own divider */
	columnHeight = $state(0);
	/** the row divider under the pointer or being dragged; a split preview's divider beside it lights up with it */
	rowDivider = $state<'idle' | 'hover' | 'drag'>('idle');
	/** a tab on its way between slots, so the one it left may be empty for a moment */
	moving = 0;
	private nextId = 2;
	private host: GroupHost | null = null;
	/** what a slot's visual editor shows, set by the component that draws the slots */
	ownOf: ((id: number) => GroupOwnDoc | null) | null = null;
	/** the file the focused slot last had drawn, and who waits for the next one */
	private drawn: { id: number; path: string | null } | null = null;
	private waiters: (() => void)[] = [];

	attach(host: GroupHost): () => void {
		this.host = host;
		tabs.onRetarget = (where) => this.retarget(where);
		tabs.persistedList = () => (this.focused.window ? (this.list.find((g) => g.id === this.homeId)?.tabs?.list ?? []) : null);
		// an editor in a window of its own shows its one file: what it opens goes to this window's last slot
		openFileElsewhere.current = (path) => {
			const shown = activeFilePath.current;
			if (!this.focused.window || (shown && samePath(shown, path))) return false;
			if (browser) window.focus();
			this.focus(this.homeId, { path });
			return true;
		};
		return () => {
			if (this.host !== host) return;
			this.host = null;
			openFileElsewhere.current = null;
		};
	}

	get focused(): EditorGroup {
		return this.list.find((g) => g.id === this.focusedId) ?? this.list[0];
	}

	isFocused(g: EditorGroup): boolean {
		return g.id === this.focusedId;
	}

	/** the row of the focused slot, or of this window's last one while a window of its own has focus */
	get focusedRow(): number {
		const id = this.focused.window ? this.homeId : this.focusedId;
		return cellOf(
			this.layout,
			this.grid.findIndex((g) => g.id === id)
		).row;
	}

	/** the slots of the layout, in its order; a slot in a window of its own is not one */
	get grid(): EditorGroup[] {
		return this.list.filter((g) => !g.window);
	}

	/** a folder opens with the layout it was left with, or one editor */
	restore(root: string | null): void {
		for (const g of this.list) if (g.tabs) tabs.others.delete(g.tabs);
		const saved = root ? loadGroups(root) : null;
		this.layout = saved?.layout ?? 'one';
		this.split = saved?.split ?? { column: 0.5, row: 0.5 };
		this.list = (saved?.slots ?? [{ focused: true as const, mode: this.host?.mode() ?? 'visual' }]).map((g): EditorGroup => {
			const id = this.nextId++;
			if (g.focused) return { id, tabs: null, frozen: null, active: null, mode: g.mode };
			const store = new TabsStore();
			store.list = g.tabs;
			tabs.others.add(store);
			return { id, tabs: store, frozen: null, active: g.active, mode: g.mode, unseen: g.tabs.length > 0 };
		});
		const focused = this.list.find((g) => !g.tabs)!;
		this.focusedId = focused.id;
		this.homeId = focused.id;
		if (saved) this.host?.setMode(focused.mode);
	}

	/** what is saved with the folder */
	save(root: string): void {
		saveGroups(
			root,
			this.layout,
			this.split,
			this.grid.map((g) => {
				const live = this.isFocused(g);
				return { focused: g.id === this.homeId, tabs: g.tabs?.list ?? [], active: g.active, mode: (live && this.host?.mode()) || g.mode };
			})
		);
	}

	/**
	 * Another layout. A bigger one opens the focused slot's file in each new slot; a smaller one hands the
	 * tabs of the slots that go to the first slot
	 */
	setLayout(next: EditorLayout): void {
		const host = this.host;
		if (!host || next === this.layout) return;
		// the new slots open the file of this window's last slot
		if (this.focused.window) this.focus(this.homeId);
		// the workspace runs on the focused slot, so focus moves off one that goes before it goes
		if (relayout(this.grid, this.layout, next).gone.some((g) => this.isFocused(g))) this.focus(this.grid[0].id);
		const { kept, gone } = relayout(this.grid, this.layout, next);
		const windows = this.list.filter((g) => g.window);
		const tab = host.activeTab();
		if (tab && kept.includes(null)) host.beforeSplit();
		const frozen = tab && kept.includes(null) ? host.capture() : null;
		const mode = host.mode();
		this.list = [...kept.map((g) => g ?? this.openedSlot(tab, frozen, mode)), ...windows];
		const first = this.storeOf(this.list[0].id);
		for (const g of gone) {
			first?.append(g.tabs?.list ?? []);
			if (g.tabs) tabs.others.delete(g.tabs);
		}
		this.layout = next;
	}

	private openedSlot(tab: Tab | null, frozen: FrozenPane | null, mode: EditMode): EditorGroup {
		const store = new TabsStore();
		store.list = tab ? [tab] : [];
		tabs.others.add(store);
		return { id: this.nextId++, tabs: store, frozen, active: tab, mode, split: !!tab };
	}

	private storeOf(id: number): TabsStore | null {
		return id === this.focusedId ? tabs : (this.list.find((g) => g.id === id)?.tabs ?? null);
	}

	/** `tab`: the one to show there, put on the group's strip if it is not on it yet */
	focus(id: number, tab?: Tab): void {
		const host = this.host;
		const to = this.list.find((g) => g.id === id);
		const from = this.focused;
		if (!host || !to || !to.tabs) {
			if (to && to === from && tab) host?.enter(tab, to.mode, null);
			return;
		}
		const store = to.tabs;
		if (tab && !store.has(tabKey(tab))) store.list = [...store.list, tab];
		const active = tab ?? to.active ?? store.list[0] ?? null;
		const own = to.frozen ? (this.ownOf?.(id) ?? null) : null;
		// before the exchange, or the slot left behind keeps the strip of the one it hands over to
		const left = { frozen: host.capture(), active: host.activeTab(), mode: host.mode() };
		tabs.exchange(store);
		this.list = this.list.map((g) => {
			if (g === from) return { ...g, ...left, tabs: store, unseen: false };
			// its snapshot stays until its file is open and drawn: the pane shows it in the meantime
			if (g === to) return { ...g, tabs: null, active, split: false };
			return g;
		});
		this.focusedId = id;
		if (!to.window) this.homeId = id;
		tabs.persist();
		host.enter(active, to.mode, own);
		if (to.split && !tab) void this.whenDrawn().then(() => this.focusedId === id && host.placeSplitCaret());
	}

	/** a slot in a window of its own, showing `tab`; the tab is still on its strip, to be taken off by whoever moves it */
	addWindow(tab: Tab, mode: EditMode, at: { x: number; y: number }): number {
		const store = new TabsStore();
		store.list = [tab];
		tabs.others.add(store);
		const id = this.nextId++;
		this.list = [...this.list, { id, tabs: store, frozen: null, active: tab, mode, window: at }];
		return id;
	}

	/** its window went, and its file with it: focus goes back to this window's last slot */
	removeWindow(id: number): void {
		const g = this.list.find((x) => x.id === id);
		if (!g?.window) return;
		if (this.isFocused(g)) this.focus(this.homeId);
		const store = this.list.find((x) => x.id === id)?.tabs;
		if (store) tabs.others.delete(store);
		this.list = this.list.filter((x) => x.id !== id);
	}

	/** the slot's edit mode, the focused one's as the workspace has it */
	modeOf(id: number): EditMode {
		if (id === this.focusedId) return this.host?.mode() ?? 'visual';
		return this.list.find((g) => g.id === id)?.mode ?? 'visual';
	}

	/** the focused group shows `path`, drawn: wakes whoever waits for that */
	markDrawn(path: string | null): void {
		this.drawn = { id: this.focusedId, path };
		const waiting = this.waiters;
		this.waiters = [];
		for (const resolve of waiting) resolve();
		this.list = this.list.map((g) => (this.isFocused(g) && g.frozen ? { ...g, frozen: null } : g));
	}

	/** resolves once the focused group shows the workspace's file */
	whenDrawn(): Promise<void> {
		const d = this.drawn;
		const path = activeFilePath.current;
		if (d && d.id === this.focusedId && (d.path === path || (!!d.path && !!path && samePath(d.path, path)))) return Promise.resolve();
		return new Promise((resolve) => this.waiters.push(resolve));
	}

	/** an action on a parked group: it takes focus first, and the action runs once its file is drawn */
	focusThen(id: number, run: () => void, tab?: Tab): void {
		this.focus(id, tab);
		void this.whenDrawn().then(run);
	}

	/** a parked slot shown in the other mode, `frozen` what it is drawn from now */
	setParkedMode(id: number, mode: EditMode, frozen: FrozenPane): void {
		this.list = this.list.map((g) => (g.id === id && !this.isFocused(g) ? { ...g, mode, frozen } : g));
	}

	/** a group's tabs, wherever they are kept */
	tabsOf(id: number): Tab[] {
		if (id === this.focusedId) return tabs.list;
		return this.list.find((g) => g.id === id)?.tabs?.list ?? [];
	}

	/** the tab a group shows */
	activeOf(id: number): Tab | null {
		if (id !== this.focusedId) return this.list.find((g) => g.id === id)?.active ?? null;
		return this.host?.activeTab() ?? null;
	}

	/** a tab off a group's strip that the group is not showing, so nothing has to open in its place */
	removeTab(id: number, key: string): void {
		this.storeOf(id)?.close(key);
	}

	/** files dropped on a slot: on its strip at `index`, or after its tabs, the last one shown */
	openIn(id: number, paths: string[], index: number | null): void {
		const store = this.storeOf(id);
		const opened: Tab[] = paths.map((path) => ({ path }));
		if (!store || !opened.length) return;
		store.append(opened);
		if (index !== null) opened.forEach((tab, i) => store.move(tabKey(tab), index + i));
		this.focus(id, opened.at(-1));
	}

	/** a parked slot with nothing in it, its strip and its picture both */
	empty(id: number): void {
		const store = this.list.find((g) => g.id === id && !this.isFocused(g))?.tabs;
		if (!store) return;
		store.list = [];
		this.list = this.list.map((g) => (g.id === id ? { ...g, frozen: null, active: null, split: false } : g));
	}

	/** the slot's last tab went: the slot closes when the slots left fit a smaller layout */
	closeIfEmpty(id: number): void {
		if (this.moving || !this.host || !this.grid.some((g) => g.id === id) || this.tabsOf(id).length) return;
		const shrunk = shrunkLayout(
			this.layout,
			this.grid.map((g) => this.tabsOf(g.id).length > 0)
		);
		if (!shrunk) return;
		const first = this.grid[shrunk.keep[0]].id;
		if (!this.focused.window && !shrunk.keep.some((i) => this.isFocused(this.grid[i]))) this.focus(first);
		const grid = this.grid;
		const kept = shrunk.keep.map((i) => grid[i]);
		for (const g of grid) if (!kept.includes(g) && g.tabs) tabs.others.delete(g.tabs);
		if (!kept.some((g) => g.id === this.homeId)) this.homeId = first;
		this.list = [...kept, ...this.list.filter((g) => g.window)];
		this.layout = shrunk.layout;
	}

	/** two places of the layout trade slots, each slot keeping its tabs */
	tradePlaces(a: number, b: number): void {
		const grid = this.grid;
		const [x, y] = [grid[a], grid[b]];
		if (!x || !y) return;
		this.list = this.list.map((g) => (g === x ? y : g === y ? x : g));
	}

	/** a tab dragged along its own strip */
	moveWithin(id: number, key: string, index: number): void {
		this.storeOf(id)?.move(key, index);
	}

	/** a rename or a delete reached the parked slots' strips: each shows its file where it went, or nothing */
	private retarget(where: (path: string) => string | null): void {
		this.list = this.list.map((g) => {
			if (this.isFocused(g)) return g;
			const shown = (g.frozen?.loadedPath as string | null | undefined) ?? null;
			const movedTo = shown && where(shown);
			const activeTo = g.active && where(g.active.path);
			if (shown === movedTo && g.active?.path === (activeTo ?? undefined)) return g;
			const gone = !!shown && !movedTo;
			if (shown && movedTo) moveFile(shown, movedTo);
			// the visual editor keeps the document it has, so a rename is no new file to it
			const doc = this.ownOf?.(g.id)?.doc;
			const frozen = gone ? null : shown && movedTo ? { ...g.frozen, loadedPath: movedTo, ...(doc && { visualDoc: doc }) } : g.frozen;
			const active = gone || !g.active || !activeTo ? null : { ...g.active, path: activeTo };
			return { ...g, frozen, active };
		});
	}

	/** Ctrl+1 to 4: the slot at that place */
	focusAt(index: number): void {
		const g = this.grid[index];
		if (!g || index >= slotCount(this.layout)) return;
		this.focus(g.id);
		this.keyboardFocus = g.id;
	}

	/** the row divider moved to `y` from the top of the editor column: the split preview's divider moves it too */
	moveRowDividerTo(y: number): void {
		const at = this.rowTops[1];
		if (at === undefined) return;
		const [a, b] = movedDivider(this.rowSizes, 0, y - (at - 1), MIN_ROW_PX);
		if (a + b > 0) this.resizeSplit('row', a / (a + b));
	}

	/** a divider dragged: the first column's or first row's part */
	resizeSplit(axis: keyof DividerSplit, part: number): void {
		this.split = { ...this.split, [axis]: Math.max(0, Math.min(1, part)) };
	}
}

export const editorGroups = new EditorGroups();
