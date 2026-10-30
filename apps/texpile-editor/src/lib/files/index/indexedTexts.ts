import { collabHost } from '$lib/collab/hostStore.svelte';
import { toLf } from '$lib/workspace/edits/lineEndings';
import { fileService } from '../service/fileService';
import { fileIdentityKey } from '../identity/fileUris';
import { clearFileIndexes } from './fileIndex';

const kept = new Map<string, { text: string; stamp: string }>();

/** what was read from a folder is stale once another opens */
export function forgetIndexedTexts(): void {
	kept.clear();
	clearFileIndexes();
}

fileService.onDidUseProvider(forgetIndexedTexts);

/** a loaded file's editor text, any other file read once and kept until the file service sees it change */
export async function indexedText(path: string, read: (path: string) => Promise<string> = (p) => fileService.readText(p)): Promise<string> {
	const loaded = collabHost.loadedText(path);
	if (loaded !== null) return loaded;
	const key = fileIdentityKey(path);
	const stamp = fileService.changeStamp(path);
	const found = kept.get(key);
	if (found?.stamp === stamp) return found.text;
	const text = toLf(await read(path));
	kept.set(key, { text, stamp });
	return text;
}
