import { statFile } from '$lib/workspace/fileSystem';
// The visual editor's workspace file access, injected by WorkspaceView from the active
// workspace provider so extensions never touch the disk client directly: a guest session
// resolves URLs from the shared doc's blob cache and uploads through the session instead.

let resolveUrl: ((path: string) => string) | null = null;
let writeBinary: ((path: string, blob: Blob) => Promise<void>) | null = null;
let graphicDirs: (() => string[]) | null = null;

export function setEditorFileAccess(
	resolve: ((path: string) => string) | null,
	write: ((path: string, blob: Blob) => Promise<void>) | null
): void {
	resolveUrl = resolve;
	writeBinary = write;
}

/**
 * Where a relative \includegraphics could resolve to, in LaTeX's own search order.
 *
 * Injected rather than computed here because it needs the project root, the open file and the
 * source's \graphicspath - none of which the image extension has. The hover tooltip already
 * resolves graphics this way; sharing one resolver is what stops a thumbnail and the rendered
 * image disagreeing about where a file is.
 */
export function setEditorGraphicDirs(fn: (() => string[]) | null): void {
	graphicDirs = fn;
}

export function editorGraphicDirs(): string[] {
	return graphicDirs?.() ?? [];
}

/** bytes URL for a workspace path; '' outside a workspace (img just stays broken). */
export function editorFileUrl(path: string): string {
	return resolveUrl?.(path) ?? '';
}

export async function editorWriteBinary(path: string, blob: Blob): Promise<void> {
	if (!writeBinary) throw new Error('No workspace to write to');
	await writeBinary(path, blob);
}

// a guest's file arrives from the host after the editor first asked for it: what showed it missing tries again
export const FILES_ARRIVED = 'texpile:files-arrived';

export function announceFilesArrived(): void {
	globalThis.dispatchEvent?.(new Event(FILES_ARRIVED));
}

/** whether a file url names a file; a workspace file is asked of the disk, so a miss logs no failed request */
export async function fileUrlExists(url: string): Promise<boolean> {
	if (url.startsWith('texfile:')) {
		const path = new URL(url).searchParams.get('path');
		const st = path ? await statFile(path) : null;
		return !!st?.exists && !st.isDirectory;
	}
	try {
		return (await fetch(url, { method: 'HEAD', cache: 'no-store' })).ok;
	} catch {
		return false;
	}
}

/** the first of `urls` that names a file */
export async function firstExistingUrl(urls: readonly string[]): Promise<string | null> {
	for (const url of urls) if (await fileUrlExists(url)) return url;
	return null;
}
