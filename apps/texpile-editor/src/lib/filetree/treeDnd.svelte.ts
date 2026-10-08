/* eslint-disable no-param-reassign -- drag-and-drop works by mutating the event's dataTransfer */
// Drag and drop over the tree: internal moves, absolute-path drags from another Texpile
// window (copied, not moved), and file drops from the OS.
import type { TreeEntry } from '$lib/workspace/fileSystem';
import { dropDir, isInside } from './treePaths';
import { collectDropItems, type ImportItem } from './treeImport';
import { endSlotDrag, startFileDrag } from '$lib/workspace/groups/slotDrag.svelte';

export const ROOT = '__root__';
// a tag, not the data: drag payloads are sealed until drop, so only the TYPE is readable on dragover
const PATHS_MIME = 'application/x-texpile-paths';

type DndHooks = {
	rootPath: () => string;
	selectedEntries: () => TreeEntry[];
	ensureSelected: (entry: TreeEntry) => void;
	onMove: (entries: TreeEntry[], targetDir: string) => void;
	onImport?: (items: ImportItem[], targetDir: string) => void;
	onCopyIn?: (paths: string[], targetDir: string) => void;
};

export class FileTreeDnd {
	dragging = $state<TreeEntry | null>(null);
	dragPaths = $state<string[]>([]);
	// the DIRECTORY that would receive the drop, or ROOT
	dropTarget = $state<string | null>(null);

	constructor(private hooks: DndHooks) {}

	private canDropAll(target: string): boolean {
		return this.dragPaths.length > 0 && this.dragPaths.every((p) => target !== p && !isInside(target, p));
	}
	private isExternalDrag(e: DragEvent): boolean {
		return !this.dragging && !!e.dataTransfer?.types?.includes('Files');
	}
	private isCrossWindowDrag(e: DragEvent): boolean {
		return !this.dragging && !!e.dataTransfer?.types?.includes(PATHS_MIME);
	}
	private markTarget(dir: string): void {
		this.dropTarget = dir === this.hooks.rootPath() ? ROOT : dir;
	}

	onRowDragStart(e: DragEvent, entry: TreeEntry): void {
		this.hooks.ensureSelected(entry);
		this.dragging = entry;
		this.dragPaths = this.hooks.selectedEntries().map((x) => x.path);
		// files dropped on an editor slot open there
		startFileDrag(
			this.hooks
				.selectedEntries()
				.filter((x) => x.type === 'file')
				.map((x) => x.path)
		);
		if (e.dataTransfer) {
			// move within this window; a drop in another window's tree copies instead
			e.dataTransfer.effectAllowed = 'copyMove';
			e.dataTransfer.setData('text/plain', this.dragPaths.join('\n'));
			e.dataTransfer.setData(PATHS_MIME, JSON.stringify(this.dragPaths));
		}
	}

	onRowDragOver(e: DragEvent, entry: TreeEntry): void {
		const dir = dropDir(entry);
		if (this.isExternalDrag(e) || this.isCrossWindowDrag(e)) {
			e.preventDefault();
			e.stopPropagation();
			if (e.dataTransfer) e.dataTransfer.dropEffect = 'copy';
			this.markTarget(dir);
			return;
		}
		if (!this.canDropAll(dir)) return;
		e.preventDefault();
		e.stopPropagation(); // the container's handler would re-target the drop to ROOT
		if (e.dataTransfer) e.dataTransfer.dropEffect = 'move';
		this.markTarget(dir);
	}

	onRowDrop(e: DragEvent, entry: TreeEntry): void {
		e.preventDefault();
		e.stopPropagation();
		this.finishDrop(e, dropDir(entry));
	}

	onRootDragOver(e: DragEvent): void {
		if (this.isExternalDrag(e) || this.isCrossWindowDrag(e)) {
			e.preventDefault();
			if (e.dataTransfer) e.dataTransfer.dropEffect = 'copy';
			this.dropTarget = ROOT;
			return;
		}
		if (!this.canDropAll(this.hooks.rootPath())) return;
		e.preventDefault();
		if (e.dataTransfer) e.dataTransfer.dropEffect = 'move';
		this.dropTarget = ROOT;
	}

	onRootDrop(e: DragEvent): void {
		e.preventDefault();
		this.finishDrop(e, this.hooks.rootPath());
	}

	private finishDrop(e: DragEvent, targetDir: string): void {
		const external = this.isExternalDrag(e);
		const crossWindow = this.isCrossWindowDrag(e);
		const entries = this.dragging ? this.hooks.selectedEntries() : [];
		const valid = this.canDropAll(targetDir);
		this.dragging = null;
		this.dragPaths = [];
		this.dropTarget = null;
		if (crossWindow) {
			// copies rather than moves, so the source window's workspace is not mutated behind its back
			let paths: string[] = [];
			try {
				paths = JSON.parse(e.dataTransfer?.getData(PATHS_MIME) || '[]');
			} catch {
				/* malformed payload: ignore the drop */
			}
			const safe = paths.filter((p) => typeof p === 'string' && p && targetDir !== p && !isInside(targetDir, p));
			if (safe.length) this.hooks.onCopyIn?.(safe, targetDir);
		} else if (external) {
			void collectDropItems(e).then((items) => {
				if (items.length) this.hooks.onImport?.(items, targetDir);
			});
		} else if (entries.length && valid) {
			this.hooks.onMove(entries, targetDir);
		}
	}

	// on the container, not per row: moving between rows fires a dragleave that would blank the ring
	onTreeDragLeave(e: DragEvent): void {
		const to = e.relatedTarget as Node | null;
		if (!to || !(e.currentTarget as HTMLElement).contains(to)) this.dropTarget = null;
	}

	onDragEnd(): void {
		endSlotDrag();
		this.dragging = null;
		this.dragPaths = [];
		this.dropTarget = null;
	}
}
