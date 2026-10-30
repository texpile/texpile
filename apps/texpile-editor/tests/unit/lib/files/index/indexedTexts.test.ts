import { describe, expect, it } from 'vitest';
import { fileService } from '$lib/files/service/fileService';
import { fileUriOf } from '$lib/files/identity/fileUris';
import type { FileChange } from '$lib/files/changes/fileChanges';
import type { WorkspaceProvider } from '$lib/workspace/workspaceProvider';
import { indexedText } from '$lib/files/index/indexedTexts';

function folder(files: Record<string, string>) {
	let reads = 0;
	let fire: (changes: FileChange[]) => void = () => {};
	const provider = {
		readText: async (path: string) => {
			reads++;
			return files[path];
		},
		writeText: async (path: string, text: string) => {
			files[path] = text;
		},
		watch: (onChange: (changes: FileChange[]) => void) => {
			fire = onChange;
			return () => {};
		}
	} as unknown as WorkspaceProvider;
	return { provider, files, reads: () => reads, change: (path: string) => fire([{ type: 'updated', resource: fileUriOf(path) }]) };
}

describe('indexedText', () => {
	it('reads a file once until the watcher reports it changed', async () => {
		const f = folder({ '/p/a.tex': 'one' });
		const detach = fileService.use(f.provider);
		expect(await indexedText('/p/a.tex')).toBe('one');
		expect(await indexedText('/p/a.tex')).toBe('one');
		expect(f.reads()).toBe(1);
		f.files['/p/a.tex'] = 'two';
		f.change('/p/a.tex');
		expect(await indexedText('/p/a.tex')).toBe('two');
		detach();
	});

	it('forgets what it read from a folder once another opens', async () => {
		const first = folder({ '/p/a.tex': 'old' });
		const close = fileService.use(first.provider);
		expect(await indexedText('/p/a.tex')).toBe('old');
		close();
		const second = folder({ '/p/a.tex': 'new' });
		const detach = fileService.use(second.provider);
		expect(await indexedText('/p/a.tex')).toBe('new');
		detach();
	});

	it('reads a file again after this window writes it, whatever listens first', async () => {
		const f = folder({ '/p/main.tex': 'before' });
		const detach = fileService.use(f.provider);
		const seen: string[] = [];
		const off = fileService.onDidRunOperation(() => void indexedText('/p/main.tex').then((t) => seen.push(t)));
		expect(await indexedText('/p/main.tex')).toBe('before');
		await fileService.writeText('/p/main.tex', 'after');
		await new Promise((r) => setTimeout(r, 0));
		expect(seen).toEqual(['after']);
		off();
		detach();
	});
});
