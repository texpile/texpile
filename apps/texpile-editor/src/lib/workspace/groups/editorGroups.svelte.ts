// Editor groups, VS Code's split editor: side by side, each with its own tabs and its own open file.
// The focused group is the one the workspace runs on (activeFilePath, `tabs`, the editor stores). The
// others keep their editor on screen as it was when focus left, parked, until a click brings them back
import { tabs, tabKey, TabsStore, type Tab } from '../tabs.svelte';
import { samePath } from '../fileSystem';
import { activeFilePath } from '../workspaceStore';
import { loadGroups, saveGroups } from './groupsPersist';
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
	/** focus moves to a group: its view mode, then its tab; `own` is the document its editor shows */
	enter(tab: Tab | null, mode: EditMode, own: GroupOwnDoc | null): void;
	/** before a split: the caret saved and the document up to date, so the new editor opens where this one is */
	beforeSplit(): void;
};

/** a parked group's own editor document, and the snapshot it answers to */
export type GroupOwnDoc = { doc: PMNode; frozen: FrozenPane };

export type EditorGroup = {
	id: number;
	/** a parked group's tabs; the focused group's are in `tabs` */
	tabs: TabsStore | null;
	/** how the group was drawn when focus left it */
	frozen: FrozenPane | null;
	active: Tab | null;
	mode: EditMode;
	/** its part of the editor column's width */
	share: number;
	/** restored with the folder and not drawn yet: it has no snapshot to show */
	unseen?: boolean;
};

class EditorGroups {
	// raw: a snapshot holds whole documents and source maps, which a deep proxy would wrap; replaced, never mutated
	list = $state.raw<EditorGroup[]>([{ id: 1, tabs: null, frozen: null, active: null, mode: 'visual', share: 1 }]);
	focusedId = $state(1);
	/** a group focused from the keyboard, whose editor takes the keyboard once it is drawn */
	keyboardFocus = $state<number | null>(null);
	private nextId = 2;
	private host: GroupHost | null = null;
	/** the document a group's visual editor shows, set by the component that draws the groups */
	docOf: ((id: number) => PMNode | null) | null = null;
	/** the file the focused group last had drawn, and who waits for the next one */
	private drawn: { id: number; path: string | null } | null = null;
	private waiters: (() => void)[] = [];

	attach(host: GroupHost): () => void {
		this.host = host;
		return () => {
			if (this.host === host) this.host = null;
		};
	}

	get focused(): EditorGroup {
		return this.list.find((g) => g.id === this.focusedId) ?? this.list[0];
	}

	isFocused(g: EditorGroup): boolean {
		return g.id === this.focusedId;
	}

	/** a folder opens with the groups it was left with, or one */
	restore(root: string | null): void {
		for (const g of this.list) if (g.tabs) tabs.others.delete(g.tabs);
		const mode = this.host?.mode() ?? 'visual';
		const saved = root ? loadGroups(root) : null;
		this.list = (saved ?? [{ focused: true as const, share: 1 }]).map((g): EditorGroup => {
			const id = this.nextId++;
			if (g.focused) return { id, tabs: null, frozen: null, active: null, mode, share: g.share };
			const store = new TabsStore();
			store.list = g.tabs;
			tabs.others.add(store);
			return { id, tabs: store, frozen: null, active: g.active, mode: g.mode, share: g.share, unseen: true };
		});
		this.focusedId = this.list.find((g) => !g.tabs)!.id;
	}

	/** what is saved with the folder */
	save(root: string): void {
		saveGroups(
			root,
			this.list.map((g) => ({ focused: this.isFocused(g), share: g.share, tabs: g.tabs?.list ?? [], active: g.active, mode: g.mode }))
		);
	}

	/** VS Code's Split Editor Right: the focused file again in a new group to the right, which takes focus */
	splitRight(): void {
		this.split(null, 'right');
	}

	/** a tab, the focused one by default, in a new group beside one, the focused one by default; it takes focus */
	split(which: Tab | null, side: 'left' | 'right', besideId = this.focusedId): void {
		const host = this.host;
		const from = this.list.find((g) => g.id === besideId);
		const tab = which ?? host?.activeTab();
		if (!host || !tab || !from) return;
		host.beforeSplit();
		const store = new TabsStore();
		store.list = [tab];
		const at = this.list.indexOf(from) + (side === 'right' ? 1 : 0);
		const share = from.share / 2;
		const group: EditorGroup = { id: this.nextId++, tabs: store, frozen: null, active: tab, mode: host.mode(), share };
		tabs.others.add(store);
		const resized = this.list.map((g) => (g === from ? { ...g, share } : g));
		this.list = [...resized.slice(0, at), group, ...resized.slice(at)];
		this.focus(group.id);
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
		const active = tab ?? to.active;
		const ownDoc = this.docOf?.(id) ?? null;
		const own = ownDoc && to.frozen ? { doc: ownDoc, frozen: to.frozen } : null;
		tabs.exchange(store);
		this.list = this.list.map((g) => {
			if (g === from) return { ...g, tabs: store, frozen: host.capture(), active: host.activeTab(), mode: host.mode(), unseen: false };
			// its snapshot stays until its file is open and drawn: the pane shows it in the meantime
			if (g === to) return { ...g, tabs: null, active };
			return g;
		});
		this.focusedId = id;
		host.enter(active, to.mode, own);
	}

	/**
	 * The focused group is leaving `path`: a parked group on the same file has followed it up to now, so
	 * its snapshot takes the text as it is, or it would show, and later open, an older one
	 */
	refreshParked(path: string, now: FrozenPane): void {
		this.list = this.list.map((g) =>
			g.frozen && !this.isFocused(g) && g.frozen.loadedPath === path
				? {
						...g,
						frozen: { ...g.frozen, texSource: now.texSource, rawContent: now.rawContent, sourceMap: now.sourceMap, docMeta: now.docMeta }
					}
				: g
		);
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

	/** VS Code's Open to the Side: in the group right of the focused one, or a new one there */
	openToSide(tab: Tab): void {
		const at = this.list.findIndex((g) => g.id === this.focusedId);
		const beside = this.list[at + 1];
		if (beside) this.focus(beside.id, tab);
		else this.split(tab, 'right');
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
		const store = id === this.focusedId ? tabs : this.list.find((g) => g.id === id)?.tabs;
		store?.close(key);
	}

	/** a tab dragged along its own strip */
	moveWithin(id: number, key: string, index: number): void {
		const store = id === this.focusedId ? tabs : this.list.find((g) => g.id === id)?.tabs;
		store?.move(key, index);
	}

	/** focus the group next to this one by position, as Ctrl+1/2/3 does */
	focusAt(index: number): void {
		const g = this.list[index];
		if (!g) return;
		this.focus(g.id);
		this.keyboardFocus = g.id;
	}

	/** an empty group goes, and its width goes to the one beside it */
	close(id: number): void {
		if (this.list.length < 2) return;
		const at = this.list.findIndex((g) => g.id === id);
		if (at < 0) return;
		const neighbourId = (this.list[at + 1] ?? this.list[at - 1]).id;
		if (this.focusedId === id) this.focus(neighbourId);
		const gone = this.list.find((g) => g.id === id)!;
		if (gone.tabs) tabs.others.delete(gone.tabs);
		this.list = this.list.filter((g) => g.id !== id).map((g) => (g.id === neighbourId ? { ...g, share: g.share + gone.share } : g));
	}

	/** the divider between group `index` and the next one moved by `delta`, as a part of the column */
	resize(index: number, delta: number): void {
		const a = this.list[index];
		const b = this.list[index + 1];
		if (!a || !b) return;
		const least = 0.12 * (a.share + b.share);
		const moved = Math.max(least - a.share, Math.min(b.share - least, delta));
		this.list = this.list.map((g) => (g === a ? { ...g, share: a.share + moved } : g === b ? { ...g, share: b.share - moved } : g));
	}

	/** double-click on a divider, as in VS Code: every group the same width */
	even(): void {
		const share = 1 / this.list.length;
		this.list = this.list.map((g) => ({ ...g, share }));
	}
}

export const editorGroups = new EditorGroups();
