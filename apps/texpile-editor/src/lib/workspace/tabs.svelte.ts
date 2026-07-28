// Open-file tabs, VS Code style: which files are open and in what order. Per window and per
// user (shared sessions don't sync tab state). The ACTIVE file stays workspaceStore's
// activeFilePath; WorkspaceView wires activation, closing and tree-change cleanup to this.
import { samePath, joinPath } from './fileSystem';

const TABS_KEY = 'texpile:tabs'; // { [folderRoot]: relPath[] }
const MAX_TABS = 50;

const sepOf = (p: string) => (p.includes('\\') ? '\\' : '/');

class TabsStore {
	list = $state<string[]>([]);
	private root: string | null = null;
	private persistable = false;

	/** folder (re)opened: restore the persisted tab set for disk-backed roots. */
	bind(root: string | null, persist: boolean): void {
		this.root = root;
		this.persistable = persist && !!root && typeof localStorage !== 'undefined';
		this.list = [];
		if (!this.persistable || !root) return;
		try {
			const all = JSON.parse(localStorage.getItem(TABS_KEY) || '{}') as Record<string, string[]>;
			const rels = all[root];
			if (Array.isArray(rels)) this.list = rels.slice(0, MAX_TABS).map((r) => joinPath(root, String(r)));
		} catch {
			/* fresh set */
		}
	}

	private persist(): void {
		if (!this.persistable || !this.root) return;
		const root = this.root;
		try {
			const all = JSON.parse(localStorage.getItem(TABS_KEY) || '{}') as Record<string, string[]>;
			all[root] = this.list.map((p) => p.slice(root.length).replace(/^[\\/]/, ''));
			localStorage.setItem(TABS_KEY, JSON.stringify(all));
		} catch {
			/* storage blocked; tabs just don't persist */
		}
	}

	has(path: string): boolean {
		return this.list.some((t) => samePath(t, path));
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
		if (this.has(path)) return;
		this.list = [...this.list.slice(-(MAX_TABS - 1)), path];
		this.persist();
	}

	/** the tab to activate when closing the active one: right neighbor first, then left. */
	neighborOf(path: string): string | null {
		const i = this.list.findIndex((t) => samePath(t, path));
		if (i < 0) return null;
		return this.list[i + 1] ?? this.list[i - 1] ?? null;
	}

	close(path: string): void {
		this.list = this.list.filter((t) => !samePath(t, path));
		this.persist();
	}

	/** a deleted folder takes every tab under it along. */
	closeUnder(path: string): void {
		const prefix = path + sepOf(path);
		this.list = this.list.filter((t) => !samePath(t, path) && !t.startsWith(prefix));
		this.persist();
	}

	/** a rename/move retargets the tab, or every tab under it when a folder moved. */
	rename(from: string, to: string): void {
		const prefix = from + sepOf(from);
		this.list = this.list.map((t) => (samePath(t, from) ? to : t.startsWith(prefix) ? to + t.slice(from.length) : t));
		this.persist();
	}

	/** drop tabs whose files no longer exist (tree refreshes, remote deletions). */
	prune(livePaths: string[]): void {
		const next = this.list.filter((t) => livePaths.some((p) => samePath(p, t)));
		if (next.length !== this.list.length) {
			this.list = next;
			this.persist();
		}
	}

	cycle(current: string | null, dir: 1 | -1): string | null {
		if (this.list.length === 0) return null;
		const i = current ? this.list.findIndex((t) => samePath(t, current)) : -1;
		return this.list[(i + dir + this.list.length) % this.list.length] ?? null;
	}
}

export const tabs = new TabsStore();
