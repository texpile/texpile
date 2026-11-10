// @vitest-environment jsdom
import { it, expect, vi } from 'vitest';
import { TreeNameEditor } from '$lib/filetree/treeNameEditor.svelte';

function editorWith(taken: string[] = []) {
	const hooks = {
		rootPath: () => '/ws',
		expand: vi.fn(),
		onCreate: vi.fn(),
		onRename: vi.fn(),
		nameTaken: (_dir: string, name: string) => taken.includes(name.trim()),
		takenMessage: (name: string) => `${name} exists`,
		includeName: (name: string) => `${name}.tex`,
		refocusTree: vi.fn()
	};
	return { editor: new TreeNameEditor(hooks), hooks };
}

it('hands focus back to the tree once Enter creates the file, so Ctrl+Z undoes the file', () => {
	const { editor, hooks } = editorWith();
	editor.startCreate('/ws', 'file');
	editor.createValue = 'new.tex';
	editor.keydownCreate(new KeyboardEvent('keydown', { key: 'Enter' }));
	expect(hooks.onCreate).toHaveBeenCalledWith('/ws', 'new.tex', 'file');
	expect(hooks.refocusTree).toHaveBeenCalledTimes(1);
});

it('keeps focus in the field when Enter is refused on a taken name', () => {
	const { editor, hooks } = editorWith(['main.tex']);
	editor.startCreate('/ws', 'file');
	editor.createValue = 'main.tex';
	editor.keydownCreate(new KeyboardEvent('keydown', { key: 'Enter' }));
	expect(editor.creatingIn).toBe('/ws');
	expect(hooks.refocusTree).not.toHaveBeenCalled();
});
