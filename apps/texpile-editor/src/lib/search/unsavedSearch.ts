import { pathBelow } from '$lib/files/identity/fileUris';
import { samePath, type SearchFileResult } from '$lib/workspace/fileSystem';

export type SearchOptions = { regex: boolean; caseSensitive: boolean };

/** the main process's line test (electron/src/fs/fsSearch.ts), null for an invalid pattern */
export function searchLineTest(q: string, o: SearchOptions): ((line: string) => boolean) | null {
	if (o.regex) {
		try {
			const re = new RegExp(q, o.caseSensitive ? '' : 'i');
			return (l) => re.test(l);
		} catch {
			return null;
		}
	}
	const needle = o.caseSensitive ? q : q.toLowerCase();
	return (l) => (o.caseSensitive ? l : l.toLowerCase()).includes(needle);
}

/** vscode's open editor rule: a file with unsaved edits is searched in the editor, and its disk result goes */
export function overlayUnsaved(
	disk: SearchFileResult[],
	unsaved: { path: string; text: string }[],
	root: string,
	test: (line: string) => boolean
): SearchFileResult[] {
	const inFolder = unsaved.filter((f) => pathBelow(root, f.path) !== null);
	if (!inFolder.length) return disk;
	const kept = disk.filter((r) => !inFolder.some((f) => samePath(f.path, r.file)));
	for (const f of inFolder) {
		const matches = f.text.split('\n').flatMap((text, i) => (test(text) ? [{ line: i + 1, text: text.slice(0, 400) }] : []));
		if (matches.length) kept.push({ file: f.path, rel: pathBelow(root, f.path)!, matches });
	}
	return kept.sort((a, b) => a.rel.localeCompare(b.rel));
}
