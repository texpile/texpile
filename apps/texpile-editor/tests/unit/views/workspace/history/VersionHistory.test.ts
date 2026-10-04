// @vitest-environment jsdom
// Version History's own hands: Escape leaves a name unsaved (the field losing focus as it is taken away
// saves what it holds, as Chromium blurs a focused field that is removed), each row says what its copy
// is, Copy says it copied only when it did, and Restore Deleted File finds a folder's deleted files
// however the folder's name is cased, as the main process compares paths on Windows and macOS.
import { it, expect, vi, beforeEach, afterEach } from 'vitest';
import { mount, unmount, flushSync, tick, type Component } from 'svelte';

const h = vi.hoisted(() => ({
	entries: [{ id: 'aB3d.tex', timestamp: Date.now() }] as { id: string; timestamp: number; source?: string }[],
	copy: 'Same text.\n',
	/** copies by id, where one differs from the rest */
	copies: {} as Record<string, string>,
	files: [] as { resource: string; count: number; newest: number; exists: boolean }[],
	actions: {
		currentText: vi.fn(async (_p: string) => 'Same text.\n' as string | null),
		rename: vi.fn(async () => {}),
		create: vi.fn(async () => {}),
		restore: vi.fn(async () => false),
		remove: vi.fn(async () => {}),
		show: vi.fn(),
		leave: vi.fn()
	},
	toaster: { success: vi.fn(), error: vi.fn(), info: vi.fn(), warning: vi.fn() }
}));

vi.mock('$lib/workspace/localHistory/localHistory.svelte', () => ({
	listLocalHistory: vi.fn(async () => h.entries),
	readLocalHistory: vi.fn(async (_p: string, id: string) => h.copies[id] ?? h.copy),
	// as the main process answers: every file under the folder, compared without case as Windows does
	listAllLocalHistory: vi.fn(async (under: string) =>
		h.files.filter((f) => f.resource.toLowerCase().startsWith(under.toLowerCase().replace(/\\+$/, '') + '\\'))
	),
	sourceLabel: (s?: string) => s ?? 'File Saved',
	localHistoryRevision: { current: 0 },
	LOCAL_REF: 'local:'
}));
vi.mock('$lib/workspace/localHistory/localHistoryActions.svelte', () => ({ localHistoryActions: { current: h.actions } }));
vi.mock('$lib/modals/toaster-svelte', () => ({ toaster: h.toaster }));

const { default: VersionHistoryPanel } = await import('../../../../../src/views/workspace/history/VersionHistoryPanel.svelte');
const { default: VersionHistoryButtons } = await import('../../../../../src/views/workspace/history/VersionHistoryButtons.svelte');
const { default: RestoreDeletedDialog } = await import('../../../../../src/views/workspace/history/RestoreDeletedDialog.svelte');

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

/** `ready`: what is on screen once the copies are read and counted */
async function render<P extends Record<string, unknown>>(component: Component<P>, props: P, ready = 'button') {
	app = mount(component, { target: document.body.appendChild(document.createElement('div')), props });
	await vi.waitFor(() => {
		flushSync();
		expect(document.querySelector(ready)).toBeTruthy();
	});
	await tick();
	flushSync();
}

const panel = () => render(VersionHistoryPanel, { path: '/p/main.tex', hash: 'local:aB3d.tex' }, 'ul[aria-label="Copies"]');
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
	await panel();
	button('Save a Copy Now…')!.click();
	flushSync();
	const input = document.querySelector<HTMLInputElement>('input[aria-label="Name this copy"]')!;
	typeThenEscape(input, 'Sent to the committee');
	await tick();
	expect(h.actions.create).not.toHaveBeenCalled();
	expect(document.querySelector('input[aria-label="Name this copy"]')).toBeNull();
});

it('Escape in Rename leaves the copy’s name as it was', async () => {
	await panel();
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

it('says what each copy is, marks the one the file matches, and shows another when picked', async () => {
	const was = h.entries;
	h.entries = [
		{ id: 'new.tex', timestamp: Date.now() },
		{ id: 'aB3d.tex', timestamp: Date.now() - 600_000, source: 'Sent to the committee' }
	];
	h.copies = { 'aB3d.tex': 'Old words here.\n' };
	try {
		await panel();
		await vi.waitFor(() => expect(document.querySelectorAll('ul[aria-label="Copies"] li.group')).toHaveLength(2));
		const rows = [...document.querySelectorAll('ul[aria-label="Copies"] li.group')];
		expect(rows[0].textContent).toContain('Same as now');
		expect(rows[0].textContent).toMatch(/words changed/);
		expect(rows[1].textContent).toContain('Sent to the committee');
		expect(rows[1].className).toContain('bg-primary-tint');
		rows[0].querySelector('button')!.click();
		expect(h.actions.show).toHaveBeenCalledWith('/p/main.tex', h.entries[0], 'local:aB3d.tex');
	} finally {
		h.entries = was;
		h.copies = {};
	}
});

it('says the text was copied only when the clipboard took it', async () => {
	const writeText = vi.fn(async (_text: string): Promise<void> => {
		throw new Error('denied');
	});
	vi.stubGlobal('navigator', { ...navigator, clipboard: { writeText } });
	await render(VersionHistoryButtons, { path: '/p/main.tex', hash: 'local:aB3d.tex' });
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
	await render(RestoreDeletedDialog, { root: 'c:\\thesis', under: 'c:\\thesis\\chapters' });
	await vi.waitFor(() => expect(document.body.textContent).toContain('gone.tex'));
	expect(document.body.textContent).not.toContain('No deleted files here have copies left.');
	expect(document.body.textContent).not.toContain('main.tex');
});
