import type { WorkspaceProvider } from '$lib/workspace/workspaceProvider';
import type { SourceRead } from '$lib/workspace/sourceEncoding';
import type { TexFile, TreeEntry, SearchFileResult } from '$lib/workspace/fileSystem';
import { diskProvider } from '$lib/workspace/diskProvider';
import { FileChangesEvent, type FileChange } from '../changes/fileChanges';
import { FileOperationEvent, type FileOperation } from '../changes/fileOperations';
import { fileUriOf } from '../identity/fileUris';
import { extUri } from '../identity/extUri';
import type { URI } from 'vscode-uri';

type Listener<E> = (e: E) => void;

function subscribe<E>(listeners: Set<Listener<E>>, fn: Listener<E>): () => void {
	listeners.add(fn);
	return () => listeners.delete(fn);
}

export class FileService {
	private provider: WorkspaceProvider | null = null;
	private readonly changeListeners = new Set<Listener<FileChangesEvent>>();
	private readonly operationListeners = new Set<Listener<FileOperationEvent>>();
	private readonly providerListeners = new Set<Listener<void>>();
	// counted before any listener hears of it; a delete or move may take a folder, so it moves the epoch
	private readonly changeCounts = new Map<string, number>();
	private changeEpoch = 0;

	/** the open workspace's provider until the returned detach */
	use(provider: WorkspaceProvider): () => void {
		this.provider = provider;
		this.changeEpoch++;
		for (const fn of [...this.providerListeners]) fn();
		const unwatch = provider.watch?.((changes) => this.fireFileChanges(changes));
		return () => {
			unwatch?.();
			if (this.provider !== provider) return;
			this.provider = null;
			this.changeEpoch++;
			for (const fn of [...this.providerListeners]) fn();
		};
	}

	/** what changed underneath us: the disk watcher for the host, the manifest for a guest */
	onDidFilesChange(fn: Listener<FileChangesEvent>): () => void {
		return subscribe(this.changeListeners, fn);
	}

	onDidUseProvider(fn: Listener<void>): () => void {
		return subscribe(this.providerListeners, fn);
	}

	/** what this window did through the service */
	onDidRunOperation(fn: Listener<FileOperationEvent>): () => void {
		return subscribe(this.operationListeners, fn);
	}

	/** what changes when the file at `path` does: a text read under the same stamp is still the file's */
	changeStamp(path: string): string {
		return `${this.changeEpoch}:${this.changeCounts.get(extUri.getComparisonKey(fileUriOf(path))) ?? 0}`;
	}

	private changed(resource: URI, folderWide: boolean): void {
		if (folderWide) {
			this.changeEpoch++;
			return;
		}
		const key = extUri.getComparisonKey(resource);
		this.changeCounts.set(key, (this.changeCounts.get(key) ?? 0) + 1);
	}

	private fireFileChanges(changes: FileChange[]): void {
		if (!changes.length) return;
		for (const change of changes) this.changed(change.resource, change.type === 'deleted');
		const event = new FileChangesEvent(changes);
		for (const fn of [...this.changeListeners]) fn(event);
	}

	private ran(path: string, operation: FileOperation, target?: string): void {
		this.changed(fileUriOf(path), operation === 'delete' || operation === 'move');
		const event = new FileOperationEvent(fileUriOf(path), operation, target === undefined ? undefined : fileUriOf(target));
		for (const fn of [...this.operationListeners]) fn(event);
	}

	/** the workspace's provider for its own paths, the disk for every other */
	private providerFor(path: string): WorkspaceProvider {
		const p = this.provider;
		return p && (p.owns?.(path) ?? true) ? p : diskProvider;
	}

	readText(path: string): Promise<string> {
		return this.providerFor(path).readText(path);
	}

	readSource(path: string): Promise<SourceRead> {
		return this.providerFor(path).readSource(path);
	}

	/** raw bytes, for the text or binary sniff; `root` is the open folder the file belongs to */
	readBytes(path: string, root: string): Promise<Uint8Array> {
		const p = this.providerFor(path);
		if (!p.readBytes) throw new Error(`no bytes for ${path}`);
		return p.readBytes(path, root);
	}

	async probe(path: string): Promise<{ size: number; binary: boolean } | null> {
		return (await this.providerFor(path).probe?.(path)) ?? null;
	}

	stat(path: string): Promise<{ exists: boolean; mtimeMs: number; size: number; isDirectory?: boolean }> {
		return this.providerFor(path).stat(path);
	}

	async exists(path: string): Promise<boolean> {
		return (await this.stat(path)).exists;
	}

	fileUrl(path: string): string {
		return this.providerFor(path).fileUrl(path);
	}

	scanTree(root: string): Promise<TreeEntry[]> {
		return this.providerFor(root).scanTree(root);
	}

	scanTexFiles(root: string): Promise<TexFile[]> {
		return this.providerFor(root).scanTexFiles(root);
	}

	/** one traversal where the provider walks a disk */
	async scanTreeAndFiles(root: string): Promise<{ children: TreeEntry[]; files: TexFile[] }> {
		const p = this.providerFor(root);
		if (p.scanTreeAndFiles) return p.scanTreeAndFiles(root);
		const [children, files] = await Promise.all([p.scanTree(root), p.scanTexFiles(root)]);
		return { children, files };
	}

	scanFiles(root: string, exts: string[]): Promise<TexFile[]> {
		return this.providerFor(root).scanFiles(root, exts);
	}

	search(
		root: string,
		query: string,
		opts?: { regex?: boolean; caseSensitive?: boolean }
	): Promise<{ results: SearchFileResult[]; truncated: boolean; total?: number; error?: string }> {
		const p = this.providerFor(root);
		if (!p.search) throw new Error('Find in files needs the folder on disk');
		return p.search(root, query, opts);
	}

	format(path: string, text: string): Promise<string> {
		const p = this.providerFor(path);
		if (!p.format) throw new Error('Formatting needs the folder on disk');
		return p.format(path, text);
	}

	/** where `rel` really lands under root (short names and case resolved), or null when outside it or unreadable */
	async realRelative(root: string, rel: string): Promise<string | null> {
		return (await this.providerFor(root).realRelative?.(root, rel)) ?? null;
	}

	async writeText(path: string, content: string): Promise<void> {
		await this.providerFor(path).writeText(path, content);
		this.ran(path, 'write');
	}

	async writeBinary(path: string, blob: Blob): Promise<void> {
		await this.providerFor(path).writeBinary(path, blob);
		this.ran(path, 'write');
	}

	async create(path: string, type: 'file' | 'dir', content?: string): Promise<void> {
		await this.providerFor(path).create(path, type, content);
		this.ran(path, 'create');
	}

	async rename(from: string, to: string): Promise<void> {
		await this.providerFor(from).rename(from, to);
		this.ran(from, 'move', to);
	}

	async copy(from: string, to: string): Promise<void> {
		await this.providerFor(to).copy(from, to);
		this.ran(to, 'copy');
	}

	async remove(path: string): Promise<void> {
		await this.providerFor(path).remove(path);
		this.ran(path, 'delete');
	}

	/** whether the provider keeps a deleted entry to fetch back */
	canTrash(path: string): boolean {
		const p = this.providerFor(path);
		return !!p.trash && !!p.restore;
	}

	/** to the recycle bin, with a backup to undo from; a provider without one removes the entry */
	async trash(path: string, root: string, keep?: boolean): Promise<{ backup: string | null; recycled: boolean; kept?: boolean }> {
		const provider = this.providerFor(path);
		const result = provider.trash
			? await provider.trash(path, root, keep)
			: (await provider.remove(path), { backup: null, recycled: false });
		if (!result.kept) this.ran(path, 'delete');
		return result;
	}

	async restore(from: string, to: string): Promise<void> {
		const provider = this.providerFor(to);
		if (!provider.restore) throw new Error('Nothing to restore from');
		await provider.restore(from, to);
		this.ran(to, 'create');
	}
}

export const fileService = new FileService();
