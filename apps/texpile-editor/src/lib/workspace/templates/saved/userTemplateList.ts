// The user's saved templates as the starter picker shows them, and the edits made from it.
import { box } from '$lib/runes/box.svelte';
import { templatesBridge, requireTemplatesBridge } from '../templateBridge';
import type { UserTemplate } from '../templateBridge.types';

// the templates IPC registers in the idle moment after the window opens, and an empty folder can
// show the picker before that: an early list call is retried for about as long as that takes
const LIST_RETRIES = 5;
const LIST_RETRY_MS = 600;

export const userTemplates = box<UserTemplate[]>([]);

function pause(ms: number): Promise<void> {
	return new Promise((resolve) => setTimeout(resolve, ms));
}

/** reload the list from disk; outside the desktop app it stays empty */
export async function refreshUserTemplates(): Promise<void> {
	const bridge = templatesBridge();
	if (!bridge) return;
	for (let attempt = 0; ; attempt++) {
		try {
			userTemplates.current = await bridge.list();
			return;
		} catch {
			if (attempt >= LIST_RETRIES) return;
			await pause(LIST_RETRY_MS);
		}
	}
}

export async function renameUserTemplate(id: string, name: string, description: string): Promise<void> {
	await requireTemplatesBridge().update(id, name, description);
	await refreshUserTemplates();
}

export async function deleteUserTemplate(id: string): Promise<void> {
	await requireTemplatesBridge().remove(id);
	await refreshUserTemplates();
}
