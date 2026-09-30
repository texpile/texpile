// @vitest-environment jsdom
// A project from a Typst Universe template, end to end on the renderer's side: tinymist unpacks
// into a staging folder of ours, the files are adopted into the project, and every staging folder
// is cleaned up whatever happens. The network itself is tinymist's and is not exercised here.
import { beforeEach, describe, expect, it, vi } from 'vitest';
import type { TexpileTemplatesBridge, UniverseTemplate } from '$lib/workspace/templates/templateBridge.types';

let resolved = true;
const request = vi.fn();
vi.mock('$lib/languages/typst/intellisense/lspClient', () => ({
	tinymistResolved: async () => resolved,
	typstClient: async () => ({ request })
}));

const { createFromUniverse, TinymistMissingError } = await import('$lib/workspace/templates/universe/universeProject');

const IEEE: UniverseTemplate = {
	name: 'charged-ieee',
	version: '0.1.4',
	description: '',
	authors: [],
	keywords: [],
	categories: [],
	thumbnail: true
};

let bridge: Pick<{ [K in keyof TexpileTemplatesBridge]: ReturnType<typeof vi.fn> }, 'stage' | 'adopt' | 'discard'>;

beforeEach(() => {
	resolved = true;
	request.mockReset();
	let n = 0;
	bridge = {
		stage: vi.fn(async () => `/data/templates/.staging/${++n}`),
		adopt: vi.fn(async () => {}),
		discard: vi.fn(async () => {})
	};
	vi.stubGlobal('texpileTemplates', bridge);
});

describe('createFromUniverse', () => {
	it('unpacks the pinned version into staging, adopts it, and opens its entry file', async () => {
		request.mockResolvedValue({ entryPath: 'main.typ' });
		expect(await createFromUniverse('/ws', IEEE)).toBe('/ws/main.typ');
		expect(request.mock.calls[0][1]).toEqual({
			command: 'tinymist.doInitTemplate',
			arguments: ['@preview/charged-ieee:0.1.4', '/data/templates/.staging/1']
		});
		expect(bridge.adopt).toHaveBeenCalledWith('/data/templates/.staging/1', '/ws');
		expect(bridge.discard).toHaveBeenCalledWith('/data/templates/.staging/1');
	});

	it('says plainly when the download fails, and leaves no staging folder', async () => {
		request.mockRejectedValue({
			code: -32603,
			message: 'failed to initialize template: failed to read package manifest (failed to download package (error sending request))'
		});
		await expect(createFromUniverse('/ws', IEEE)).rejects.toThrow('Could not download the template');
		expect(bridge.adopt).not.toHaveBeenCalled();
		expect(bridge.discard).toHaveBeenCalledWith('/data/templates/.staging/1');
	});

	it('stops before anything is written when there is no tinymist', async () => {
		resolved = false;
		await expect(createFromUniverse('/ws', IEEE)).rejects.toBeInstanceOf(TinymistMissingError);
		expect(bridge.stage).not.toHaveBeenCalled();
		expect(request).not.toHaveBeenCalled();
	});
});
