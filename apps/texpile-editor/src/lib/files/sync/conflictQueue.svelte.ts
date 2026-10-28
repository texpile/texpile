/** `memory` reads the editor's text now: a collaborator can type while the dialog is up */
export type FileCacheConflict = { path: string; disk: string; memory: () => string };

export type FileCacheChoice = 'disk' | 'memory';

/** one dialog per file, in the order the conflicts came */
class FileCacheConflicts {
	private queue = $state<FileCacheConflict[]>([]);
	onChoose: ((conflict: FileCacheConflict, choice: FileCacheChoice) => void) | null = null;

	get current(): FileCacheConflict | null {
		return this.queue[0] ?? null;
	}

	has(path: string): boolean {
		return this.queue.some((c) => c.path === path);
	}

	add(conflict: FileCacheConflict): void {
		const at = this.queue.findIndex((c) => c.path === conflict.path);
		if (at === -1) this.queue.push(conflict);
		else this.queue[at] = conflict;
	}

	remove(path: string): void {
		this.queue = this.queue.filter((c) => c.path !== path);
	}

	choose(choice: FileCacheChoice): void {
		const conflict = this.current;
		if (!conflict) return;
		this.remove(conflict.path);
		this.onChoose?.(conflict, choice);
	}

	clear(): void {
		this.queue = [];
	}
}

export const fileCacheConflicts = new FileCacheConflicts();
