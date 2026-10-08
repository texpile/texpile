// Open tabs, VS Code style: which files are open and in what order. Per window and per
// user (shared sessions don't sync tab state). The ACTIVE file stays workspaceStore's
// activeFilePath; WorkspaceView wires activation, closing and tree-change cleanup to this.
//
// A tab is a FILE or a COMPARISON of one against a saved version - the same kind of thing, so
// one strip, and both are persisted. Not the visual/source axis, which stays a preference.
import { samePath, joinPath, relativeInside } from './fileSystem';
import { getFolder, updateFolder, savedCompare, type SavedCompare, type SavedTab } from '$lib/storage/workspaces';
import { AGENT_REF } from '$lib/ai/agentPanel/changes/agentBefore';

const MAX_TABS = 50;
const REOPEN_DEPTH = 20;

/** the saved version a comparison tab is against; `path` is the file's path in that version when
 *  it was named differently (a Timeline row from before a rename) */
export type CompareRef = SavedCompare;

export type Tab = { path: string; compare?: CompareRef };

/** tabs as the folder's entry keeps them, root-relative */
export function savedTabs(root: string, list: Tab[]): SavedTab[] {
	// a file against its text before an agent's turn: that text lives in this window's memory, and a tab
	// reopened without it would show the whole file as new; one outside the root would come back under it
	return list
		.filter((t) => !t.compare?.hash.startsWith(AGENT_REF) && relativeInside(root, t.path) !== null)
		.map((t) => {
			const rel = t.path.slice(root.length).replace(/^[\\/]/, '');
			return t.compare ? { path: rel, compare: { ...t.compare } } : rel;
		});
}

/** a saved tab back on the strip, or null for an entry this build cannot read */
export function restoredTab(root: string, saved: unknown): Tab | null {
	if (typeof saved === 'string') return { path: joinPath(root, saved) };
	if (!saved || typeof saved !== 'object') return null;
	const { path, compare } = saved as { path?: unknown; compare?: unknown };
	const ref = savedCompare(compare);
	return typeof path === 'string' && ref ? { path: joinPath(root, path), compare: ref } : null;
}

// a path cannot contain NUL, so a comparison key can never collide with a plain file key
const KEY_SEP = '\u0000';

/** stable identity for a tab; one file compared against two versions is two tabs. */
export function tabKey(t: Tab): string {
	return t.compare ? `${t.path}${KEY_SEP}${t.compare.hash}` : t.path;
}

function sepOf(p: string) {
	return p.includes('\\') ? '\\' : '/';
}

export class TabsStore {
	list = $state<Tab[]>([]);
	/** VS Code style: opening another takes its slot rather than adding a tab, so browsing a tree
	 *  does not bury the strip. A KEY, so a comparison can hold the slot as a file does. */
	preview = $state<string | null>(null);
	private closed: Tab[] = [];
	private root: string | null = null;
	private persistable = false;
	/** the other editor groups' tabs, which a rename or a delete in the tree reaches as well */
	readonly others = new Set<TabsStore>();
	/** told where each path went after a rename or a delete (null: gone), so the parked slots follow their files */
	onRetarget: ((where: (path: string) => string | null) => void) | null = null;
	/** the tabs kept with the folder when they are not these: an editor in a window of its own has these */
	persistedList: (() => Tab[] | null) | null = null;

	/** goes up each time a folder is opened, so the editor groups start over as one */
	generation = $state(0);

	/** folder (re)opened: restore the persisted tab set for disk-backed roots. */
	bind(root: string | null, persist: boolean): void {
		this.generation++;
		this.root = root;
		this.persistable = persist && !!root && typeof localStorage !== 'undefined';
		this.list = [];
		this.preview = null;
		this.closed = [];
		if (!this.persistable || !root) return;
		const saved = getFolder(root).tabs;
		if (Array.isArray(saved)) this.list = saved.slice(0, MAX_TABS).flatMap((s) => restoredTab(root, s) ?? []);
	}

	/** another editor group's tabs come into this store, and this one's go to it: the focused group's are always here */
	exchange(other: TabsStore): void {
		const mine = this.contents();
		this.adopt(other.contents());
		other.adopt(mine);
		this.persist();
	}

	private contents(): { list: Tab[]; preview: string | null; closed: Tab[] } {
		return { list: this.list, preview: this.preview, closed: this.closed };
	}

	private adopt(c: { list: Tab[]; preview: string | null; closed: Tab[] }): void {
		this.list = c.list;
		this.preview = c.preview;
		this.closed = c.closed;
	}

	/** for callers that only care about documents (MCP, guards) */
	get paths(): string[] {
		return this.list.filter((t) => !t.compare).map((t) => t.path);
	}

	isPreview(key: string): boolean {
		return this.preview === key;
	}

	/** promote out of the preview slot: the file was edited, or the user asked to keep it. */
	keep(key: string): void {
		if (this.preview === key) this.preview = null;
	}

	/** the folder whose tabs these are, when they are kept between sittings */
	get persistedRoot(): string | null {
		return this.persistable ? this.root : null;
	}

	persist(): void {
		if (!this.persistable || !this.root) return;
		const saved = savedTabs(this.root, this.persistedList?.() ?? this.list);
		updateFolder(this.root, (draft) => {
			draft.tabs = saved;
		});
	}

	has(key: string): boolean {
		return this.list.some((t) => tabKey(t) === key);
	}

	/** ignoring any comparisons of it */
	hasFile(path: string): boolean {
		return this.list.some((t) => !t.compare && samePath(t.path, path));
	}

	private add(tab: Tab): void {
		const key = tabKey(tab);
		if (this.has(key)) return;
		// replacing in place keeps the strip from shuffling under the pointer
		const at = this.preview ? this.list.findIndex((t) => tabKey(t) === this.preview) : -1;
		this.list = at >= 0 ? this.list.map((t, i) => (i === at ? tab : t)) : [...this.list.slice(-(MAX_TABS - 1)), tab];
		this.preview = key;
		this.persist();
	}

	/** every opened file gains a tab (file tree, SyncTeX jumps, include links, restores). */
	noteOpened(path: string): void {
		// root-scoped: a transient cross-folder activeFilePath (mid folder-switch, held save
		// prompt) must never enter this folder's tab set or its persisted entry. persistable
		// only: guest paths are manifest-relative (no root prefix) and never persist anyway.
		if (this.root && this.persistable) {
			const prefix = this.root + sepOf(this.root);
			if (!samePath(path.slice(0, prefix.length), prefix)) return;
		}
		if (this.hasFile(path)) return;
		this.add({ path });
	}

	/** open (or re-focus) a comparison of `path` against one version; returns its key. */
	openCompare(path: string, compare: CompareRef): string {
		const tab: Tab = { path, compare };
		this.add(tab);
		return tabKey(tab);
	}

	/** the comparison of `path` against `from` turned to another version in its own slot, as picking
	 *  another copy in Version History does; opened anew when that tab is gone. Returns its key */
	replaceCompare(path: string, from: string, compare: CompareRef): string {
		const tab: Tab = { path, compare };
		const key = tabKey(tab);
		const old = tabKey({ path, compare: { hash: from, subject: '' } });
		const at = this.list.findIndex((t) => tabKey(t) === old);
		if (at < 0) return this.openCompare(path, compare);
		this.list = this.has(key) ? this.list.filter((_, i) => i !== at) : this.list.map((t, i) => (i === at ? tab : t));
		if (this.preview === old) this.preview = key;
		this.persist();
		return key;
	}

	find(key: string): Tab | null {
		return this.list.find((t) => tabKey(t) === key) ?? null;
	}

	/** a tab dragged along the strip, to sit at `index` */
	move(key: string, index: number): void {
		const tab = this.find(key);
		if (!tab) return;
		const rest = this.list.filter((t) => tabKey(t) !== key);
		const at = Math.max(0, Math.min(index, rest.length));
		this.list = [...rest.slice(0, at), tab, ...rest.slice(at)];
		this.persist();
	}

	/** tabs from another strip after this one's own, each at most once */
	append(more: Tab[]): void {
		const fresh = more.filter((t, i) => !this.has(tabKey(t)) && more.findIndex((o) => tabKey(o) === tabKey(t)) === i);
		if (!fresh.length) return;
		this.list = [...this.list, ...fresh].slice(-MAX_TABS);
		this.persist();
	}

	/** right neighbour first, then left */
	neighborOf(key: string): Tab | null {
		const i = this.list.findIndex((t) => tabKey(t) === key);
		if (i < 0) return null;
		return this.list[i + 1] ?? this.list[i - 1] ?? null;
	}

	close(key: string): void {
		const tab = this.find(key);
		if (tab) this.closed = [...this.closed.filter((t) => tabKey(t) !== key).slice(-(REOPEN_DEPTH - 1)), tab];
		this.list = this.list.filter((t) => tabKey(t) !== key);
		this.keep(key); // the slot goes with the tab
		this.persist();
	}

	/** the most recently closed tab that is not open again and still has its file, back on the strip */
	reopen(exists: (path: string) => boolean): Tab | null {
		while (this.closed.length) {
			const tab = this.closed[this.closed.length - 1];
			this.closed = this.closed.slice(0, -1);
			if (this.has(tabKey(tab)) || !exists(tab.path)) continue;
			this.list = [...this.list.slice(-(MAX_TABS - 1)), tab];
			this.persist();
			return tab;
		}
		return null;
	}

	/** its comparisons go too: nothing left to sit beside */
	closeFile(path: string): void {
		for (const o of this.others) o.closeFile(path);
		this.list = this.list.filter((t) => !samePath(t.path, path));
		this.dropPreviewIfClosed();
		this.persist();
		this.onRetarget?.((p) => (samePath(p, path) ? null : p));
	}

	/** a deleted folder takes every tab under it along. */
	closeUnder(path: string): void {
		for (const o of this.others) o.closeUnder(path);
		const prefix = path + sepOf(path);
		this.list = this.list.filter((t) => !samePath(t.path, path) && !t.path.startsWith(prefix));
		this.dropPreviewIfClosed();
		this.persist();
		this.onRetarget?.((p) => (samePath(p, path) || p.startsWith(prefix) ? null : p));
	}

	/** a rename/move retargets the tab, or every tab under it when a folder moved. */
	rename(from: string, to: string): void {
		for (const o of this.others) o.rename(from, to);
		const prefix = from + sepOf(from);
		function retarget(p: string) {
			return samePath(p, from) ? to : p.startsWith(prefix) ? to + p.slice(from.length) : p;
		}
		// the preview key embeds the path, so it is re-derived from the moved tab rather than carried
		const at = this.preview ? this.list.findIndex((t) => tabKey(t) === this.preview) : -1;
		const moved = this.list.map((t) => ({ ...t, path: retarget(t.path) }));
		this.list = moved;
		this.preview = at >= 0 ? tabKey(moved[at]) : null;
		this.persist();
		this.onRetarget?.(retarget);
	}

	/** drop tabs whose files no longer exist (tree refreshes, remote deletions). */
	prune(livePaths: string[]): void {
		for (const o of this.others) o.prune(livePaths);
		const next = this.list.filter((t) => livePaths.some((p) => samePath(p, t.path)));
		if (next.length !== this.list.length) {
			this.list = next;
			this.dropPreviewIfClosed();
			this.persist();
		}
		this.onRetarget?.((p) => (livePaths.some((live) => samePath(live, p)) ? p : null));
	}

	private dropPreviewIfClosed(): void {
		if (this.preview && !this.has(this.preview)) this.preview = null;
	}

	cycle(currentKey: string | null, dir: 1 | -1): Tab | null {
		if (this.list.length === 0) return null;
		const i = currentKey ? this.list.findIndex((t) => tabKey(t) === currentKey) : -1;
		return this.list[(i + dir + this.list.length) % this.list.length] ?? null;
	}
}

export const tabs = new TabsStore();
