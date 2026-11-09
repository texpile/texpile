import type { LSPClient } from '@codemirror/lsp-client';
import { fileService } from '$lib/files/service/fileService';
import { PROJECT_FILE_RE, ProjectFileSet } from '../projectFiles';
import { fileUri, runningTypstClient } from './lspClient';

const QUIET_MS = 300;

/** reads each file and opens then closes it on the server, which makes it read the disk again */
export async function nudgeFiles(client: LSPClient, paths: string[], readText: (path: string) => Promise<string>): Promise<void> {
	const files: { rel: string; text: string }[] = [];
	for (const path of paths) {
		try {
			files.push({ rel: path, text: await readText(path) });
		} catch {
			/* gone since the event */
		}
	}
	const set = new ProjectFileSet(client, fileUri);
	set.reconcile(files);
	set.reconcile([]);
}

const pending = new Set<string>();
let timer: ReturnType<typeof setTimeout> | undefined;

// tinymist's file watcher drops an update when several files change in one burst (five rewritten files
// leave the preview on old text or a fixed error); an open and close makes it read the disk again
export function nudgeTypstDisk(root: string | null, changed: string[]): void {
	for (const path of changed) if (PROJECT_FILE_RE.test(path)) pending.add(path);
	if (!pending.size) return;
	clearTimeout(timer);
	timer = setTimeout(() => {
		const client = runningTypstClient(root);
		const paths = [...pending];
		pending.clear();
		if (client) void nudgeFiles(client, paths, (p) => fileService.readText(p));
	}, QUIET_MS);
}
