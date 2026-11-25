import type { WorkspaceProvider } from '$lib/workspace/workspaceProvider';
import { basename } from '$lib/workspace/fileSystem';

const MIME: Record<string, string> = {
	png: 'image/png',
	jpg: 'image/jpeg',
	jpeg: 'image/jpeg',
	gif: 'image/gif',
	svg: 'image/svg+xml',
	pdf: 'application/pdf'
};

/** a folder held in memory under an absolute root, the files a window would read from disk */
export class MemoryFolder {
	private readonly texts = new Map<string, string>();
	private readonly blobs = new Map<string, Blob>();
	private readonly urls = new Map<string, string>();

	constructor(
		readonly root: string,
		private readonly onWrite: (path: string, text: string) => void
	) {}

	absolute(path: string): string {
		return path.startsWith('/') || path.startsWith(this.root) ? path : `${this.root}/${path}`;
	}

	setText(path: string, text: string): void {
		this.texts.set(this.absolute(path), text);
	}

	setBytes(path: string, base64: string): void {
		const bytes = Uint8Array.from(atob(base64), (c) => c.charCodeAt(0));
		const ext = path.split('.').pop()?.toLowerCase() ?? '';
		this.blobs.set(this.absolute(path), new Blob([bytes], { type: MIME[ext] ?? 'application/octet-stream' }));
	}

	text(path: string): string | undefined {
		return this.texts.get(this.absolute(path));
	}

	textsUnder(ext: string): string[] {
		return [...this.texts].filter(([path]) => path.endsWith(`.${ext}`)).map(([, text]) => text);
	}

	has(path: string): boolean {
		return this.texts.has(this.absolute(path)) || this.blobs.has(this.absolute(path));
	}

	write(path: string, text: string): void {
		const key = this.absolute(path);
		if (this.texts.get(key) === text) return;
		this.texts.set(key, text);
		this.onWrite(path, text);
	}

	private urlOf(path: string): string {
		const key = this.absolute(path);
		const blob = this.blobs.get(key) ?? new Blob([this.texts.get(key) ?? '']);
		if (!this.urls.has(key)) this.urls.set(key, URL.createObjectURL(blob));
		return this.urls.get(key)!;
	}

	/** what the editor's file layer reads through */
	provider(): WorkspaceProvider {
		const entry = (key: string) => ({ name: basename(key), path: key, relPath: key.slice(this.root.length + 1) });
		return {
			caps: {
				manageTree: false,
				compile: false,
				git: false,
				format: false,
				search: false,
				terminal: false,
				share: false,
				comments: false,
				agent: false,
				project: true
			},
			readText: async (path) => this.text(path) ?? '',
			readSource: async (path) => ({ text: this.text(path) ?? '', encoding: 'utf8' }),
			scanTree: async () => [],
			scanTexFiles: async () => [...this.texts.keys()].filter((key) => key.endsWith('.tex')).map(entry),
			scanFiles: async (_root, exts) => [...this.texts.keys()].filter((key) => exts.includes(key.split('.').pop() ?? '')).map(entry),
			stat: async (path) => ({ exists: this.has(path), mtimeMs: 0, size: this.text(path)?.length ?? 0 }),
			fileUrl: (path) => (this.has(path) ? this.urlOf(path) : `texfile://workspace/?path=${encodeURIComponent(path)}`),
			writeText: async (path, content) => this.write(path, content),
			writeBinary: async () => {},
			create: async () => {},
			remove: async () => {},
			rename: async () => {},
			copy: async () => {},
			owns: (path) => path.startsWith(this.root)
		};
	}
}
