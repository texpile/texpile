// Editor groups, VS Code's split editor: side by side, each with its own tabs and its own open file.
// The focused group is the one the workspace runs on (activeFilePath, `tabs`, the editor stores). The
// others keep their editor on screen as it was when focus left, parked, until a click brings them back
import { tabs, TabsStore, type Tab } from '../tabs.svelte';
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
};

class EditorGroups {
	list = $state<EditorGroup[]>([{ id: 1, tabs: null, frozen: null, active: null, mode: 'visual', share: 1 }]);
	focusedId = $state(1);
	private nextId = 2;
	private host: GroupHost | null = null;
	/** the document a group's visual editor shows, set by the component that draws the groups */
	docOf: ((id: number) => PMNode | null) | null = null;

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

	/** a new folder starts with one group */
	reset(): void {
		for (const g of this.list) if (g.tabs) tabs.others.delete(g.tabs);
		this.list = [{ id: this.nextId++, tabs: null, frozen: null, active: null, mode: this.host?.mode() ?? 'visual', share: 1 }];
		this.focusedId = this.list[0].id;
	}

	/** VS Code's Split Editor Right: the focused file again in a new group to the right, which takes focus */
	splitRight(): void {
		const host = this.host;
		const from = this.focused;
		const tab = host?.activeTab();
		if (!host || !tab) return;
		host.beforeSplit();
		const store = new TabsStore();
		store.list = [tab];
		const at = this.list.indexOf(from);
		const share = from.share / 2;
		const group: EditorGroup = { id: this.nextId++, tabs: store, frozen: null, active: tab, mode: host.mode(), share };
		tabs.others.add(store);
		const resized = this.list.map((g) => (g === from ? { ...g, share } : g));
		this.list = [...resized.slice(0, at + 1), group, ...resized.slice(at + 1)];
		this.focus(group.id);
	}

	focus(id: number): void {
		const host = this.host;
		const to = this.list.find((g) => g.id === id);
		const from = this.focused;
		if (!host || !to || to === from || !to.tabs) return;
		const store = to.tabs;
		const ownDoc = this.docOf?.(id) ?? null;
		const own = ownDoc && to.frozen ? { doc: ownDoc, frozen: to.frozen } : null;
		tabs.exchange(store);
		this.list = this.list.map((g) => {
			if (g === from) return { ...g, tabs: store, frozen: host.capture(), active: host.activeTab(), mode: host.mode() };
			// its snapshot stays until its file is open and drawn: the pane shows it in the meantime
			if (g === to) return { ...g, tabs: null };
			return g;
		});
		this.focusedId = id;
		host.enter(to.active, to.mode, own);
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

	/** focus the group next to this one by position, as Ctrl+1/2/3 does */
	focusAt(index: number): void {
		const g = this.list[index];
		if (g) this.focus(g.id);
	}

	/** an empty group goes, and its width goes to the one beside it */
	close(id: number): void {
		if (this.list.length < 2) return;
		const at = this.list.findIndex((g) => g.id === id);
		if (at < 0) return;
		const neighbour = this.list[at + 1] ?? this.list[at - 1];
		if (this.focusedId === id) this.focus(neighbour.id);
		const gone = this.list.find((g) => g.id === id)!;
		if (gone.tabs) tabs.others.delete(gone.tabs);
		this.list = this.list.filter((g) => g.id !== id).map((g) => (g === neighbour ? { ...g, share: g.share + gone.share } : g));
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
