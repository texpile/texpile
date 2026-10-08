// The workspace's keys (lib/workspace/shortcuts.ts), in its window and in each editor window of its own
import { untrack } from 'svelte';
import { createCaptureKeydownHandler, createKeydownHandler, type ShortcutDeps } from '$lib/workspace/shortcuts';
import { childWindows } from '$lib/childWindows/childWindowRegistry.svelte';

/** called during component init: it runs effects */
export function bindWorkspaceShortcuts(deps: ShortcutDeps & { openSourceControl(): void }): void {
	const onKeydown = createKeydownHandler(deps);
	const onKeydownCapture = createCaptureKeydownHandler(deps);
	$effect(() => {
		const wins = [window, ...childWindows.list];
		untrack(() => {
			for (const w of wins) {
				w.addEventListener('keydown', onKeydown);
				w.addEventListener('keydown', onKeydownCapture, true);
			}
		});
		return () => {
			for (const w of wins) {
				w.removeEventListener('keydown', onKeydown);
				w.removeEventListener('keydown', onKeydownCapture, true);
			}
		};
	});
}
