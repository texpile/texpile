// @vitest-environment jsdom
import { describe, it, expect, vi } from 'vitest';
import { mount, unmount, flushSync } from 'svelte';
import { installKeyDispatch } from '$lib/keybindings/keybindings.svelte';
import { registerCommands } from '$lib/keybindings/commands/commandRegistry';
import FileTree from '$lib/filetree/FileTree.svelte';

describe('Ctrl+Z with the file tree focused', () => {
	it('undoes the file operation, not the open document', () => {
		// the app installs its key dispatch before any component mounts
		installKeyDispatch(window);
		const documentUndo = vi.fn();
		registerCommands([{ id: 'edit.undo', run: documentUndo }]);
		const history = { canUndo: true, canRedo: false, undoLabel: 'Move a.tex', redoLabel: null, undo: vi.fn(), redo: vi.fn() };
		const host = document.body.appendChild(document.createElement('div'));
		const app = mount(FileTree, {
			target: host,
			props: {
				tree: [{ name: 'main.tex', path: '/ws/main.tex', type: 'file' }],
				rootPath: '/ws',
				activePath: null,
				onOpen: vi.fn(),
				onCreate: vi.fn(),
				onRename: vi.fn(),
				onDelete: vi.fn(),
				onMove: vi.fn(),
				history: history as unknown as never
			}
		});
		flushSync();
		const row = host.querySelector('button')!;
		row.focus();
		row.dispatchEvent(new KeyboardEvent('keydown', { key: 'z', code: 'KeyZ', ctrlKey: true, bubbles: true, cancelable: true }));
		expect(history.undo).toHaveBeenCalledTimes(1);
		expect(documentUndo).not.toHaveBeenCalled();
		void unmount(app);
		host.remove();
	});
});
