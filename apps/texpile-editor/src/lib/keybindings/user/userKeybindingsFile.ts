// keybindings.json, read at launch and again whenever it changes, from Preferences, a tab or another program
import { fileService } from '$lib/files/service/fileService';
import { changeTextNow } from '$lib/buffers/textNow';
import { applyUserKeybindings } from '../keybindings.svelte';
import { readEntries, UnreadableKeybindingsError } from './keybindingEdits';

type KeybindingsBridge = {
	path(): Promise<string>;
	ensure(): Promise<string>;
	onChanged(cb: () => void): () => void;
};

function bridge(): KeybindingsBridge | undefined {
	return (globalThis.window as unknown as { texpileKeybindings?: KeybindingsBridge } | undefined)?.texpileKeybindings;
}

/** false in the browser build, which keeps the defaults */
export function userKeybindingsAvailable(): boolean {
	return !!bridge();
}

async function readFile(path: string): Promise<string | null> {
	return (await fileService.exists(path)) ? fileService.readText(path) : null;
}

let loaded: string | null | undefined;

export async function loadUserKeybindings(): Promise<void> {
	const b = bridge();
	if (!b) return;
	const text = await readFile(await b.path()).catch(() => null);
	if (text === loaded) return;
	loaded = text;
	if (text === null) return applyUserKeybindings(null);
	try {
		applyUserKeybindings(readEntries(text));
	} catch (e) {
		if (!(e instanceof UnreadableKeybindingsError)) throw e;
		applyUserKeybindings(null, true);
	}
}

/** once per window; returns the way to stop */
export function watchUserKeybindings(): () => void {
	void loadUserKeybindings();
	const off = bridge()?.onChanged(() => void loadUserKeybindings());
	function onFocus(): void {
		void loadUserKeybindings();
	}
	window.addEventListener('focus', onFocus);
	return () => {
		off?.();
		window.removeEventListener('focus', onFocus);
	};
}

/** the file with a starter if it had none; null in the browser build */
export async function ensureUserKeybindings(): Promise<string | null> {
	return (await bridge()?.ensure()) ?? null;
}

/** throws UnreadableKeybindingsError for a file that is no JSON array, which is left as it is */
export async function editUserKeybindings(edit: (text: string) => string): Promise<void> {
	const path = await ensureUserKeybindings();
	if (!path) return;
	await changeTextNow(path, edit);
	await loadUserKeybindings();
}
