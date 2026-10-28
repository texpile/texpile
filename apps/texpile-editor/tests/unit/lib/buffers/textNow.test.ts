import { describe, it, expect, vi, beforeEach } from 'vitest';

const loaded = new Map<string, string>();
const edit = vi.fn((path: string, text: string) => loaded.set(path, text));
vi.mock('$lib/collab/hostStore.svelte', () => ({
	collabHost: { loadedText: (path: string) => loaded.get(path) ?? null, edit: (path: string, text: string) => edit(path, text) }
}));

const disk = new Map<string, string>();
const writeText = vi.fn(async (path: string, text: string) => void disk.set(path, text));
vi.mock('$lib/files/service/fileService', () => ({
	fileService: {
		exists: async (path: string) => disk.has(path),
		readText: async (path: string) => disk.get(path) ?? '',
		writeText: (path: string, text: string) => writeText(path, text)
	}
}));

const { changeTextNow } = await import('$lib/buffers/textNow');

describe('changeTextNow', () => {
	beforeEach(() => {
		loaded.clear();
		disk.clear();
		edit.mockClear();
		writeText.mockClear();
	});

	it('edits a loaded file in the editor and leaves its disk to the save', async () => {
		disk.set('/p/refs.bib', '@a{x}\n');
		loaded.set('/p/refs.bib', '@a{x}\n@b{unsaved}\n');
		await changeTextNow('/p/refs.bib', (text) => text + '@c{new}\n');
		expect(edit).toHaveBeenCalledWith('/p/refs.bib', '@a{x}\n@b{unsaved}\n@c{new}\n');
		expect(writeText).not.toHaveBeenCalled();
	});

	it('rewrites a file nothing has loaded with its own line endings', async () => {
		disk.set('/p/refs.bib', '@a{x}\r\n');
		await changeTextNow('/p/refs.bib', (text) => text + '@c{new}\r\n');
		expect(disk.get('/p/refs.bib')).toBe('@a{x}\r\n@c{new}\r\n');
		expect(edit).not.toHaveBeenCalled();
	});
});
