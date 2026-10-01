// the detailed word count: from the main file when it reads the open one, else the open file alone
import { countProjectWords, counts, type ProjectWords } from '$lib/workspace/wordCount/projectWords';
import { NO_WORDS } from '$lib/workspace/wordCount/proseWords';
import { documentCountStore } from '$lib/stores/countStore.svelte';
import { dirname, samePath } from '$lib/workspace/fileSystem';
import { mainFile, workspaceRoot } from '$lib/workspace/workspaceStore';
import type { DocumentBuffer } from '$lib/workspace/documentBuffer.svelte';
import type { WorkspaceProvider } from '$lib/workspace/workspaceProvider';

export async function countDocumentWords(doc: DocumentBuffer, provider: WorkspaceProvider): Promise<ProjectWords | null> {
	if (!doc.path) return null;
	const open: string = doc.path;
	const root = workspaceRoot.current ?? dirname(open);
	function read(p: string): Promise<string> {
		return samePath(p, open) ? Promise.resolve(doc.buffer) : provider.readText(p);
	}
	const main = mainFile.current;
	// a Markdown file is no part of the paper: it shows the main file's, or its own when there is none
	if (!/\.(tex|typ)$/i.test(open)) {
		if (main) {
			try {
				return await countProjectWords(main, root, read);
			} catch {
				/* the main file cannot be read: count the open one */
			}
		}
		const words = { ...NO_WORDS, body: documentCountStore.words };
		const characters = documentCountStore.charactersWithSpaces;
		return { files: [{ path: open, words, characters }], total: words, characters };
	}
	if (main && !samePath(main, open) && /\.typ$/i.test(main) === /\.typ$/i.test(open)) {
		try {
			const whole = await countProjectWords(main, root, read);
			if (counts(whole, open)) return whole;
		} catch {
			/* the main file cannot be read: count the open one */
		}
	}
	return countProjectWords(open, root, read);
}
