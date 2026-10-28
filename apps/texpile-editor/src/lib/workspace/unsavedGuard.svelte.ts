// Leaving the folder or closing the window while edits are not on disk: a write failed, or a File Cache Conflict
// waits for its choice. Autosave writes everything else.
import { basename } from '$lib/workspace/fileSystem';
import type { FileWriter } from '$lib/buffers/fileWriter';
import { promptAsk } from '$lib/modals/confirm.svelte';
import { m } from '$lib/paraglide/messages';

export type UnsavedGuardDeps = {
	writer: FileWriter;
};

export class UnsavedGuard {
	onDiscard: ((path: string) => void) | null = null;

	constructor(private deps: UnsavedGuardDeps) {}

	/** resolves true to go on, false on Cancel */
	async confirmLeave(): Promise<boolean> {
		await this.deps.writer.flushAndWait();
		const stranded = this.deps.writer.stranded();
		if (!stranded.length) return true;
		const choice = await promptAsk({
			title: m.wsview_stranded_title(),
			message: m.wsview_stranded_body({ names: stranded.map(basename).join(', ') }),
			buttons: [
				{ id: 'discard', label: m.wsview_stranded_discard() },
				{ id: 'cancel', label: m.wsview_cancel_label(), primary: true }
			],
			cancelId: 'cancel'
		});
		if (choice !== 'discard') return false;
		for (const path of stranded) {
			this.deps.writer.revert(path);
			this.onDiscard?.(path);
		}
		return true;
	}
}
