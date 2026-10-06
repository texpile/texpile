// @vitest-environment jsdom
// A project from a Typst Universe template, end to end on the renderer's side: main unpacks into a
// staging folder of ours, the files are adopted into the project, and the staging folder is
// cleaned up whatever happens. The download itself is main's and is not exercised here.
import { beforeEach, describe, expect, it, vi } from 'vitest';
import type { TexpileTemplatesBridge, UniverseTemplate } from '$lib/workspace/templates/templateBridge.types';

let resolved = true;
vi.mock('$lib/languages/typst/intellisense/lspClient', () => ({ tinymistResolved: async () => resolved }));

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

let bridge: Pick<{ [K in keyof TexpileTemplatesBridge]: ReturnType<typeof vi.fn> }, 'stage' | 'adopt' | 'discard' | 'universeUnpack'>;

beforeEach(() => {
	resolved = true;
	bridge = {
		stage: vi.fn(async () => '/data/templates/.staging/1'),
		adopt: vi.fn(async () => {}),
		discard: vi.fn(async () => {}),
		universeUnpack: vi.fn(async () => ({ entryPath: 'main.typ' }))
	};
	vi.stubGlobal('texpileTemplates', bridge);
});

describe('createFromUniverse', () => {
	it('unpacks the pinned version into staging, adopts it, and opens its entry file', async () => {
		expect(await createFromUniverse('/ws', IEEE)).toBe('/ws/main.typ');
		expect(bridge.universeUnpack).toHaveBeenCalledWith('charged-ieee', '0.1.4', '/data/templates/.staging/1');
		expect(bridge.adopt).toHaveBeenCalledWith('/data/templates/.staging/1', '/ws');
	});

	it('says plainly when the download fails, and leaves no staging folder', async () => {
		bridge.universeUnpack.mockRejectedValue(
			new Error("Error invoking remote method 'templates:universeUnpack': Error: failed to download package (HTTP 503)")
		);
		await expect(createFromUniverse('/ws', IEEE)).rejects.toThrow('Could not download the template');
		expect(bridge.adopt).not.toHaveBeenCalled();
		expect(bridge.discard).toHaveBeenCalledWith('/data/templates/.staging/1');
	});

	it('stops before anything is written when there is no tinymist', async () => {
		resolved = false;
		await expect(createFromUniverse('/ws', IEEE)).rejects.toBeInstanceOf(TinymistMissingError);
		expect(bridge.stage).not.toHaveBeenCalled();
	});
});
