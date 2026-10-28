import { describe, expect, it, vi } from 'vitest';
import type { WorkspaceProvider } from '$lib/workspace/workspaceProvider';

const onDisk = vi.fn(async (_path: string, _text: string) => {});
vi.mock('$lib/workspace/fileSystem', async (original) => ({
	...(await original<typeof import('$lib/workspace/fileSystem')>()),
	writeTextFile: (path: string, text: string) => onDisk(path, text)
}));
const { fileService } = await import('$lib/files/service/fileService');

describe('fileService', () => {
	it('writes a guest’s own path to the session and this computer’s paths to its disk, and reports both', async () => {
		const inSession = vi.fn(async () => {});
		const detach = fileService.use({ writeText: inSession, owns: (p: string) => !p.startsWith('/') } as unknown as WorkspaceProvider);
		const ran: string[] = [];
		const off = fileService.onDidRunOperation((e) => ran.push(e.resource.path));
		await fileService.writeText('main.tex', 'shared');
		await fileService.writeText('/home/me/.config/texpile/snippets.json', '{}');
		off();
		detach();
		expect([inSession.mock.calls.length, onDisk.mock.calls[0]?.[0], ran]).toEqual([
			1,
			'/home/me/.config/texpile/snippets.json',
			['/main.tex', '/home/me/.config/texpile/snippets.json']
		]);
	});
});
