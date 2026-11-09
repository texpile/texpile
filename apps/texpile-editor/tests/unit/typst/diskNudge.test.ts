import { describe, it, expect } from 'vitest';
import type { LSPClient } from '@codemirror/lsp-client';
import { nudgeFiles } from '$lib/languages/typst/intellisense/diskNudge';

function fakeClient(owned: string[] = []) {
	const calls: string[] = [];
	const client = {
		didOpen: (f: { uri: string; doc: { toString(): string } }) => calls.push(`open ${f.uri} ${f.doc.toString()}`),
		didClose: (uri: string) => calls.push(`close ${uri}`),
		workspace: { getFile: (uri: string) => (owned.includes(uri) ? { getView: () => ({}) } : null) }
	} as unknown as LSPClient;
	return { client, calls };
}

describe('nudgeFiles', () => {
	it('opens each file with its disk text and closes it again', async () => {
		const { client, calls } = fakeClient();
		await nudgeFiles(client, ['/p/ch1.typ', '/p/refs.bib'], async (path) => `text of ${path}`);
		expect(calls).toEqual([
			'open file:///p/ch1.typ text of /p/ch1.typ',
			'open file:///p/refs.bib text of /p/refs.bib',
			'close file:///p/ch1.typ',
			'close file:///p/refs.bib'
		]);
	});

	it('skips a file that is gone and one an editor holds', async () => {
		const { client, calls } = fakeClient(['file:///p/open.typ']);
		await nudgeFiles(client, ['/p/gone.typ', '/p/open.typ', '/p/ok.typ'], async (path) => {
			if (path.includes('gone')) throw new Error('ENOENT');
			return 'x';
		});
		expect(calls.filter((c) => c.startsWith('open'))).toEqual(['open file:///p/ok.typ x']);
	});
});
