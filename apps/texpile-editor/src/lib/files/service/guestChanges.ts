import type { FileChange } from '../changes/fileChanges';
import { fileUriOf } from '../identity/fileUris';

/** path to the host's revision of its bytes */
export type ManifestRevisions = ReadonlyMap<string, number>;

export function diffManifest(before: ManifestRevisions, after: ManifestRevisions): FileChange[] {
	const changes: FileChange[] = [];
	for (const [path, rev] of after) {
		const was = before.get(path);
		if (was === undefined) changes.push({ type: 'added', resource: fileUriOf(path) });
		else if (was !== rev) changes.push({ type: 'updated', resource: fileUriOf(path) });
	}
	for (const path of before.keys()) if (!after.has(path)) changes.push({ type: 'deleted', resource: fileUriOf(path) });
	return changes;
}

export function watchManifest(
	read: () => ManifestRevisions,
	subscribe: (cb: () => void) => () => void,
	onChange: (changes: FileChange[]) => void
): () => void {
	let last = read();
	return subscribe(() => {
		const next = read();
		const changes = diffManifest(last, next);
		last = next;
		onChange(changes);
	});
}
