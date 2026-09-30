// A project from a Typst Universe template goes through tinymist's doInitTemplate. The argument and
// answer shapes here are the ones tinymist 0.15 was checked to use: [spec, absolute folder] in,
// { entryPath } (relative to that folder) out, a JSON-RPC error object when it refuses.
import { beforeEach, describe, expect, it, vi } from 'vitest';

const request = vi.fn();
let client: { request: typeof request } | null = { request };
vi.mock('$lib/languages/typst/intellisense/lspClient', () => ({ typstClient: async () => client }));

const { initTypstTemplate, TemplateInitError } = await import('$lib/languages/typst/intellisense/initTemplate');

function folders() {
	let n = 0;
	return vi.fn(async () => `/data/templates/.staging/${++n}`);
}

beforeEach(() => {
	request.mockReset();
	client = { request };
});

describe('initTypstTemplate', () => {
	it('asks tinymist to unpack the pinned spec into an empty folder, and returns the entry file', async () => {
		request.mockResolvedValue({ entryPath: 'main.typ' });
		const nextDir = folders();
		expect(await initTypstTemplate('/ws', '@preview/charged-ieee:0.1.4', nextDir)).toEqual({
			dir: '/data/templates/.staging/1',
			entryPath: 'main.typ'
		});
		expect(request).toHaveBeenCalledWith('workspace/executeCommand', {
			command: 'tinymist.doInitTemplate',
			arguments: ['@preview/charged-ieee:0.1.4', '/data/templates/.staging/1']
		});
	});

	it('asks again, into a fresh folder, when a slow download outlasts the request timeout', async () => {
		request.mockRejectedValueOnce(new Error('Request timed out')).mockResolvedValueOnce({ entryPath: 'resume.typ' });
		const nextDir = folders();
		const got = await initTypstTemplate('/ws', '@preview/modern-cv:0.8.0', nextDir);
		expect(got).toEqual({ dir: '/data/templates/.staging/2', entryPath: 'resume.typ' });
		expect(nextDir).toHaveBeenCalledTimes(2);
	});

	it("passes tinymist's refusal on as the message", async () => {
		request.mockRejectedValue({ code: -32603, message: 'failed to initialize template: package @preview/x:1.0.0 is not a template' });
		const failure = initTypstTemplate('/ws', '@preview/x:1.0.0', folders());
		await expect(failure).rejects.toBeInstanceOf(TemplateInitError);
		await expect(failure).rejects.toThrow(/is not a template/);
	});

	it('gives up after a few timeouts, and fails at once without a server', async () => {
		request.mockRejectedValue(new Error('Request timed out'));
		const nextDir = folders();
		await expect(initTypstTemplate('/ws', '@preview/x:1.0.0', nextDir)).rejects.toThrow('Request timed out');
		expect(nextDir).toHaveBeenCalledTimes(6);
		client = null;
		await expect(initTypstTemplate('/ws', '@preview/x:1.0.0', folders())).rejects.toThrow(/tinymist/);
	});

	it('refuses an answer without an entry file', async () => {
		request.mockResolvedValue(null);
		await expect(initTypstTemplate('/ws', '@preview/x:1.0.0', folders())).rejects.toThrow(/which file/);
	});
});
