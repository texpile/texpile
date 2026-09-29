// @vitest-environment jsdom
// The palette's lists are built when it opens, not while it is open: a file tree read again under
// it (a compile, the file watcher) emptied what the author was typing, and in Checkout to... loaded
// the branches again, the list flashing "Loading".
import { it, expect, vi, afterEach } from 'vitest';
import { mount, unmount, flushSync, tick } from 'svelte';
import type { TreeEntry } from '$lib/workspace/fileSystem';
import type { PaletteActions } from '$lib/workspace/commandPalette.svelte';

// zag's combobox finds its rows with CSS.escape, which jsdom does not have
globalThis.CSS ??= { escape: (s: string) => s.replace(/[^\w-]/g, (c) => `\\${c}`) } as typeof CSS;

const buildCommands = vi.fn(() => [{ id: 'compile', label: 'Compile', run: () => {} }]);
vi.mock('$lib/palette/paletteCommands', () => ({ buildCommands }));
const branchItems = vi.fn(async () => [{ id: 'branch:draft', label: 'draft', run: () => {} }]);
vi.mock('$lib/palette/paletteBranchItems', () => ({ branchItems }));

const CommandPalette = (await import('$lib/palette/CommandPalette.svelte')).default;
const { commandPalette, setPaletteActions } = await import('$lib/workspace/commandPalette.svelte');
const { fileTree, workspaceRoot } = await import('$lib/workspace/workspaceStore');

let app: Record<string, unknown> | null = null;
afterEach(() => {
	commandPalette.hide();
	flushSync();
	if (app) unmount(app);
	app = null;
	document.body.innerHTML = '';
});

function tree(...names: string[]): TreeEntry[] {
	return names.map((name) => ({ name, path: `/p/${name}`, type: 'file' }) as TreeEntry);
}

async function open(mode: 'all' | 'branches') {
	workspaceRoot.current = '/p';
	fileTree.current = tree('main.tex');
	setPaletteActions({ openFile: () => {} } as unknown as PaletteActions);
	app = mount(CommandPalette, { target: document.body.appendChild(document.createElement('div')) });
	commandPalette.show(mode);
	flushSync();
	await tick();
	return document.querySelector('input')!;
}

async function type(input: HTMLInputElement, text: string) {
	input.value = text;
	input.dispatchEvent(new Event('input', { bubbles: true }));
	flushSync();
	await tick();
}

it('keeps what was typed when the file tree is read again', async () => {
	vi.clearAllMocks();
	const input = await open('all');
	await type(input, 'comp');
	expect(input.value).toBe('comp');

	fileTree.current = tree('main.tex', 'main.pdf');
	flushSync();
	await tick();
	expect(input.value).toBe('comp');
	expect(buildCommands).toHaveBeenCalledTimes(1);
});

it('does not load the branches again when the file tree is read again', async () => {
	vi.clearAllMocks();
	const input = await open('branches');
	await type(input, 'dr');
	expect(branchItems).toHaveBeenCalledTimes(1);

	fileTree.current = tree('main.tex', 'main.aux');
	flushSync();
	await tick();
	expect(branchItems).toHaveBeenCalledTimes(1);
	expect(input.value).toBe('dr');
});

it('starts empty each time it opens, and on a change of list', async () => {
	vi.clearAllMocks();
	const input = await open('all');
	await type(input, 'comp');
	commandPalette.show('branches');
	flushSync();
	await tick();
	expect(document.querySelector('input')!.value).toBe('');
	expect(branchItems).toHaveBeenCalledTimes(1);
});
