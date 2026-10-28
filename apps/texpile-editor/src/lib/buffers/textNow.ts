import { collabHost } from '$lib/collab/hostStore.svelte';
import { fileService } from '$lib/files/service/fileService';
import { toLf } from '$lib/workspace/edits/lineEndings';

/** the editor's text when the file is loaded, else the disk's, LF either way */
export async function textNow(path: string, read: (path: string) => Promise<string> = (p) => fileService.readText(p)): Promise<string> {
	return collabHost.loadedText(path) ?? toLf(await read(path));
}

/** a loaded file takes the change as an edit, undoable and saved like typing; any other file is rewritten, '' when new */
export async function changeTextNow(path: string, change: (text: string) => string): Promise<void> {
	const loaded = collabHost.loadedText(path);
	if (loaded !== null) {
		const next = change(loaded);
		if (next !== loaded) collabHost.edit(path, next);
		return;
	}
	const text = (await fileService.exists(path)) ? await fileService.readText(path) : '';
	const next = change(text);
	if (next !== text) await fileService.writeText(path, next);
}
