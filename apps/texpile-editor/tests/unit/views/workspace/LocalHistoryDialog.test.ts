// @vitest-environment jsdom
// The Local History dialog's own hands: Escape leaves a name unsaved (the field losing focus as it
// is taken away saves what it holds, as Chromium blurs a focused field that is removed), Copy says
// it copied only when it did, and Restore Deleted File finds a folder's deleted files however the
// folder's name is cased, as the main process compares paths on Windows and macOS.
import { it, expect, vi, beforeEach, afterEach } from 'vitest';
import { mount, unmount, flushSync, tick } from 'svelte';

const h = vi.hoisted(() => ({
	entries: [{ id: 'aB3d.tex', timestamp: Date.now() }] as { id: string; timestamp: number; source?: string }[],
	copy: 'Same text.\n',
	files: [] as { resource: string; count: number; newest: number; exists: boolean }[],
	actions: {
		currentText: vi.fn(async (_p: string) => 'Same text.\n' as string | null),
		rename: vi.fn(async () => {}),
		create: vi.fn(async () => {}),
		restore: vi.fn(async () => false),
		remove: vi.fn(async () => {})
	},
	toaster: { success: vi.fn(), error: vi.fn(), info: vi.fn(), warning: vi.fn() }
}));

vi.mock('$lib/workspace/localHistory/localHistory.svelte', () => ({
	listLocalHistory: vi.fn(async () => h.entries),
	readLocalHistory: vi.fn(async () => h.copy),
	// as the main process answers: every file under the folder, compared without case as Windows does
	listAllLocalHistory: vi.fn(async (under: string) =>
		h.files.filter((f) => f.resource.toLowerCase().startsWith(under.toLowerCase().replace(/\\+$/, '') + '\\'))
	),
	entryBefore: () => null,
	sourceLabel: (s?: string) => s ?? 'File Saved',
	localHistoryRevision: { current: 0 }
}));
vi.mock('$lib/workspace/localHistory/localHistoryActions.svelte', () => ({ localHistoryActions: { current: h.actions } }));
vi.mock('$lib/modals/toaster-svelte', () => ({ toaster: h.toaster }));

const { default: LocalHistoryDialog } = await import('../../../../src/views/workspace/LocalHistoryDialog.svelte');

let app: Record<string, unknown> | null = null;
beforeEach(() => {
	for (const f of Object.values(h.actions)) f.mockClear();
	for (const f of Object.values(h.toaster)) f.mockClear();
});
afterEach(() => {
	if (app) unmount(app);
	app = null;
	document.body.innerHTML = '';
	vi.unstubAllGlobals();
});

async function render(view: { kind: 'file'; path: string } | { kind: 'deleted'; under: string }, root = '/p') {
	app = mount(LocalHistoryDialog, { target: document.body.appendChild(document.createElement('div')), props: { root, view } });
	// the copies are read, then the newest is picked
	await vi.waitFor(() => {
		flushSync();
		expect(document.body.textContent).not.toContain('Loading');
	});
	await tick();
	flushSync();
}

const button = (text: string) => [...document.querySelectorAll('button')].find((b) => b.textContent?.trim() === text);

/** typed into the field, then Escape, and the field losing focus as it is taken away */
function typeThenEscape(input: HTMLInputElement, text: string) {
	input.value = text;
	input.dispatchEvent(new Event('input', { bubbles: true }));
	input.dispatchEvent(new KeyboardEvent('keydown', { key: 'Escape', bubbles: true }));
	input.dispatchEvent(new FocusEvent('blur'));
	flushSync();
}

it('Escape in Save a Copy Now saves no copy', async () => {
	await render({ kind: 'file', path: '/p/main.tex' });
	button('Save a Copy Now…')!.click();
	flushSync();
	const input = document.querySelector<HTMLInputElement>('input[aria-label="Name this copy"]')!;
	typeThenEscape(input, 'Sent to the committee');
	await tick();
	expect(h.actions.create).not.toHaveBeenCalled();
	expect(document.querySelector('input[aria-label="Name this copy"]')).toBeNull();
});

it('Escape in Rename leaves the copy’s name as it was', async () => {
	await render({ kind: 'file', path: '/p/main.tex' });
	document.querySelector<HTMLButtonElement>('button[aria-label="More Actions…"]')!.click();
	flushSync();
	await vi.waitFor(() => expect(button('Rename…')).toBeTruthy());
	button('Rename…')!.click();
	flushSync();
	const input = document.querySelector<HTMLInputElement>('input[aria-label="Rename"]')!;
	typeThenEscape(input, 'Sent to the committee');
	await tick();
	expect(h.actions.rename).not.toHaveBeenCalled();
	expect(document.querySelector('input[aria-label="Rename"]')).toBeNull();
});

it('says the text was copied only when the clipboard took it', async () => {
	const writeText = vi.fn(async (_text: string): Promise<void> => {
		throw new Error('denied');
	});
	vi.stubGlobal('navigator', { ...navigator, clipboard: { writeText } });
	await render({ kind: 'file', path: '/p/main.tex' });
	button('Copy')!.click();
	await vi.waitFor(() => expect(h.toaster.error).toHaveBeenCalled());
	expect(h.toaster.success).not.toHaveBeenCalled();

	writeText.mockImplementationOnce(async () => {});
	button('Copy')!.click();
	await vi.waitFor(() => expect(h.toaster.success).toHaveBeenCalledWith({ title: 'Copied to the clipboard' }));
});

it('finds a deleted file under a folder named in another case than the file was first saved with', async () => {
	h.files = [
		{ resource: 'C:\\Thesis\\chapters\\gone.tex', count: 2, newest: 2_000, exists: false },
		{ resource: 'C:\\Thesis\\main.tex', count: 1, newest: 1_000, exists: true }
	];
	await render({ kind: 'deleted', under: 'c:\\thesis\\chapters' }, 'c:\\thesis');
	expect(document.body.textContent).not.toContain('No deleted files here have copies left.');
	expect(document.body.textContent).toContain('gone.tex');
	expect(document.body.textContent).not.toContain('main.tex');
});
