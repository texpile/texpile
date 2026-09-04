import { fileTree, workspaceRoot } from '$lib/workspace/workspaceStore';
import { relativeTo, type TreeEntry } from '$lib/workspace/fileSystem';
import type { PaletteActions } from '$lib/workspace/commandPalette.svelte';
import type { PaletteItem } from './paletteCommands';
import { m } from '$lib/paraglide/messages';

/** files are capped so a big project cannot push every command off the list */
export const MAX_FILE_RESULTS = 40;

/** every file in the open tree, flattened, as "go to file" entries */
export function goToFileItems(a: PaletteActions): PaletteItem[] {
	const root = workspaceRoot.current;
	const tree = fileTree.current;
	if (!root || !tree.length) return [];
	const rootDir = root;
	const out: PaletteItem[] = [];
	const group = m.palette_group_go();
	function walk(entries: TreeEntry[]) {
		for (const e of entries) {
			if (e.type === 'dir') {
				if (e.children) walk(e.children);
				continue;
			}
			const rel = relativeTo(rootDir, e.path);
			out.push({
				id: `go:${e.path}`,
				// the name is what you read; the folder is the hint, so a long path cannot swamp the row
				label: e.name,
				group,
				// matching runs against the label plus the keywords, so typing part of a folder works
				keywords: rel,
				hint: rel.includes('/') ? rel.slice(0, rel.lastIndexOf('/')) : '',
				fileName: e.name,
				run: () => a.openFile(e.path)
			});
		}
	}
	walk(tree);
	return out;
}
