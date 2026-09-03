// @vitest-environment jsdom
// The inline name input is driven by focus, and focus bugs are invisible to the node-environment
// tests the rest of the suite uses. These cover the two ways the naming step used to break.
import { describe, it, expect, vi, beforeEach, afterEach, type Mock } from 'vitest';
import { mount, unmount, flushSync } from 'svelte';
import FileTree from '../../../../src/lib/filetree/FileTree.svelte';
// the tree's right-click menu is drawn by the app-wide host now, so the tests mount that too
import ContextMenuHost from '../../../../src/lib/menus/ContextMenuHost.svelte';
import { closeContextMenu } from '../../../../src/lib/menus/contextMenu.svelte';
import type { TreeEntry } from '../../../../src/lib/workspace/fileSystem';

const ROOT = '/ws';
const tree: TreeEntry[] = [
	{ name: 'main.tex', path: '/ws/main.tex', type: 'file' },
	{ name: 'chapters', path: '/ws/chapters', type: 'dir', children: [] }
];

// the two props whose calls the assertions inspect, typed as the component declares them: a bare
// vi.fn() is Mock<Procedure | Constructable>, which satisfies no specific signature
type CreateFn = (parentDir: string, name: string, type: 'dir' | 'file' | 'include') => void;
type CopyInFn = (paths: string[], targetDir: string) => void;

let host: HTMLDivElement;
let app: Record<string, unknown> | null = null;
let menuHost: Record<string, unknown> | null = null;
let onCreate: Mock<CreateFn>;
let onCopyIn: Mock<CopyInFn>;
let history: {
	canUndo: boolean;
	canRedo: boolean;
	undoLabel: string | null;
	redoLabel: string | null;
	undo: ReturnType<typeof vi.fn>;
	redo: ReturnType<typeof vi.fn>;
};

const nameInput = () => host.querySelector<HTMLInputElement>('input.input');
const byText = (text: string) => [...host.querySelectorAll('button')].find((b) => b.textContent?.trim() === text);
const newAtRoot = (name: string) => {
	(app as unknown as { newAtRoot: (t: string, n: string) => void }).newAtRoot('file', name);
	flushSync();
};

/** the real user gesture: right-click empty tree space, then click "New File". */
function rightClickNewFile() {
	host.querySelector('div')!.dispatchEvent(new MouseEvent('contextmenu', { bubbles: true }));
	flushSync();
	byText('New File')!.click();
	flushSync();
}

function type(input: HTMLInputElement, value: string) {
	input.value = value;
	input.dispatchEvent(new Event('input', { bubbles: true }));
	flushSync();
}

beforeEach(() => {
	host = document.createElement('div');
	document.body.appendChild(host);
	onCreate = vi.fn<CreateFn>();
	onCopyIn = vi.fn<CopyInFn>();
	history = { canUndo: true, canRedo: true, undoLabel: 'Move a.tex', redoLabel: 'Delete b.tex', undo: vi.fn(), redo: vi.fn() };
	app = mount(FileTree, {
		target: host,
		props: {
			tree,
			rootPath: ROOT,
			activePath: null,
			onOpen: vi.fn(),
			onCreate,
			onRename: vi.fn(),
			onDelete: vi.fn(),
			onMove: vi.fn(),
			onCopyIn,
			onReveal: vi.fn(),
			// a stand-in for FileHistory: the component only reads these four and calls the two
			history: history as unknown as never
		}
	});
	menuHost = mount(ContextMenuHost, { target: host });
	flushSync();
});
afterEach(() => {
	closeContextMenu();
	if (app) void unmount(app);
	if (menuHost) void unmount(menuHost);
	host.remove();
});

describe('FileTree inline create', () => {
	it('creates the file under the name the user typed', () => {
		rightClickNewFile();
		const input = nameInput()!;
		expect(document.activeElement).toBe(input);
		type(input, 'intro.tex');
		input.dispatchEvent(new KeyboardEvent('keydown', { key: 'Enter', bubbles: true }));
		flushSync();
		expect(onCreate).toHaveBeenCalledWith(ROOT, 'intro.tex', 'file');
	});

	// blur is not consent: a closing menu refocusing its trigger used to commit the pre-filled
	// name, handing you an untitled.tex you never agreed to and now have to rename.
	it('does not commit a pre-filled name the user never accepted, and keeps the field open', () => {
		newAtRoot('untitled.tex');
		nameInput()!.dispatchEvent(new FocusEvent('blur', { bubbles: false }));
		flushSync();
		expect(onCreate).not.toHaveBeenCalled();
		expect(nameInput()).toBeTruthy();
	});

	// mirrors @zag-js/menu's focusTrigger: on close it does queueMicrotask(() => trigger.focus()),
	// landing right after our input mounts and stealing the field before you can type.
	it('takes focus back when a closing menu refocuses its trigger', async () => {
		const trigger = document.createElement('button');
		document.body.appendChild(trigger);
		newAtRoot('untitled.tex');
		queueMicrotask(() => trigger.focus());
		await new Promise((resolve) => requestAnimationFrame(resolve));
		expect(document.activeElement).toBe(nameInput());
		trigger.remove();
	});
});

// The tree's shortcuts are bound on window, so the ONLY thing keeping them off the editor's own
// Ctrl+Z is where focus is. That makes the negative cases here the important ones.
describe('FileTree keyboard shortcuts', () => {
	const key = (k: string, opts: KeyboardEventInit = {}) =>
		window.dispatchEvent(new KeyboardEvent('keydown', { key: k, bubbles: true, ...opts }));
	/** focus a row button, i.e. the tree genuinely owns the keyboard */
	const focusTree = () => host.querySelector('button')!.focus();

	let outside: HTMLButtonElement;
	beforeEach(() => {
		outside = document.createElement('button');
		document.body.appendChild(outside);
	});
	afterEach(() => outside.remove());

	it('undoes and redoes while the tree has focus', () => {
		focusTree();
		key('z', { ctrlKey: true });
		expect(history.undo).toHaveBeenCalledTimes(1);
		key('y', { ctrlKey: true });
		expect(history.redo).toHaveBeenCalledTimes(1);
		key('Z', { ctrlKey: true, shiftKey: true }); // the other redo chord
		expect(history.redo).toHaveBeenCalledTimes(2);
	});

	it('accepts Cmd as well as Ctrl', () => {
		focusTree();
		key('z', { metaKey: true });
		expect(history.undo).toHaveBeenCalledTimes(1);
	});

	// the whole reason this is focus-scoped: a stray Ctrl+Z while writing must never take back a
	// file deletion instead of a typo
	it('does NOTHING when focus is outside the tree', () => {
		outside.focus();
		key('z', { ctrlKey: true });
		key('y', { ctrlKey: true });
		key('c', { ctrlKey: true });
		expect(history.undo).not.toHaveBeenCalled();
		expect(history.redo).not.toHaveBeenCalled();
	});

	it('ignores a bare z, and Alt combinations', () => {
		focusTree();
		key('z');
		key('z', { ctrlKey: true, altKey: true });
		expect(history.undo).not.toHaveBeenCalled();
	});

	it('copies a selected row and pastes it into the workspace root', () => {
		const row = host.querySelector('button')!;
		row.click(); // selects /ws/main.tex
		flushSync();
		focusTree();
		key('c', { ctrlKey: true });
		key('v', { ctrlKey: true });
		expect(onCopyIn).toHaveBeenCalledWith(['/ws/main.tex'], ROOT);
	});

	it('leaves Ctrl+V alone when its own clipboard is empty, so OS-file paste still works', () => {
		focusTree();
		key('v', { ctrlKey: true });
		expect(onCopyIn).not.toHaveBeenCalled();
	});
});

describe('FileTree focus indicator', () => {
	// The accent colour is a promise that Ctrl+Z acts on FILES here rather than on the document, so
	// it has to track exactly the focus the shortcut guard reads - a highlight that outlived focus
	// would be advertising a shortcut that no longer works.
	it('accents the open file only while the tree has focus', () => {
		if (app) void unmount(app);
		app = mount(FileTree, {
			target: host,
			props: {
				tree,
				rootPath: ROOT,
				activePath: '/ws/main.tex',
				onOpen: vi.fn(),
				onCreate,
				onRename: vi.fn(),
				onDelete: vi.fn(),
				onMove: vi.fn()
			}
		});
		flushSync();
		const row = host.querySelector('div.group')!;
		const outside = document.body.appendChild(document.createElement('button'));

		// unfocused: still tinted, so you can see which file is open, but not accented
		expect(row.className, 'open-file tint should not depend on focus').toContain('bg-primary-500/15');
		expect(row.className).not.toContain('text-primary-ink');

		host.querySelector('button')!.focus();
		flushSync();
		expect(row.className, 'should accent once the tree has focus').toContain('text-primary-ink');

		outside.focus();
		flushSync();
		expect(row.className, 'should drop the accent when focus leaves').not.toContain('text-primary-700');
		expect(row.className).toContain('bg-primary-500/15');
		outside.remove();
	});
});

describe('FileTree context menu', () => {
	const menu = () => host.querySelector<HTMLElement>('div[style*="left:"]');
	const isSeparator = (el: Element | null) => !!el && el.tagName === 'DIV' && el.className.includes('border-t');

	/** right-click empty tree space (no entry), vs. a row */
	const openOnBlankSpace = () => {
		host.querySelector('div')!.dispatchEvent(new MouseEvent('contextmenu', { bubbles: true }));
		flushSync();
	};
	const openOnRow = () => {
		host.querySelector('button')!.dispatchEvent(new MouseEvent('contextmenu', { bubbles: true }));
		flushSync();
	};

	// Right-clicking empty space shows no Copy/Rename/Delete, so the undo group's trailing rule had
	// nothing beneath it and drew a stray line across the bottom of the menu.
	it('does not end with a separator when there is nothing below it', () => {
		openOnBlankSpace();
		const el = menu()!;
		expect(el).toBeTruthy();
		expect(byText('Undo Move a.tex'), 'undo group should be present').toBeTruthy();
		expect(isSeparator(el.lastElementChild), 'menu ends with a stray separator').toBe(false);
		expect(isSeparator(el.firstElementChild), 'menu starts with a stray separator').toBe(false);
	});

	// ...and it must still be there when it IS separating two groups
	it('keeps the separators when Rename/Delete follow', () => {
		openOnRow();
		const el = menu()!;
		const separators = [...el.children].filter(isSeparator);
		expect(separators).toHaveLength(2);
		expect(isSeparator(el.lastElementChild)).toBe(false);
	});
});
