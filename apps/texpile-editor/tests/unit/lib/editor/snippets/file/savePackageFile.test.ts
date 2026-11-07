import { beforeEach, describe, expect, it, vi } from 'vitest';

const { exists, writeText, probeTexPackage } = vi.hoisted(() => ({
	exists: vi.fn(async () => false),
	writeText: vi.fn(async (_path: string, _text: string) => {}),
	probeTexPackage: vi.fn()
}));
vi.mock('$lib/files/service/fileService', () => ({ fileService: { exists, writeText } }));
vi.mock('$lib/workspace/texpileDir', async (original) => ({ ...(await original<object>()), ensureTexpileIgnore: vi.fn(async () => {}) }));
vi.mock('$lib/editor/snippets/file/snippetLoader', () => ({ probeTexPackage, reloadSnippets: vi.fn() }));
vi.mock('$lib/modals/toaster-svelte', () => ({ toaster: { info: vi.fn() } }));

const { savePackageFile } = await import('$lib/editor/snippets/file/savePackageFile');

beforeEach(() => vi.clearAllMocks());

describe('savePackageFile', () => {
	it('writes what TeX reports for the package under .texpile/packages', async () => {
		probeTexPackage.mockResolvedValue({ commands: [{ name: 'hlnote', spec: 'o m', own: true }] });
		const path = await savePackageFile('/work', 'labtools');
		expect(path).toBe('/work/.texpile/packages/labtools.json');
		expect(JSON.parse(writeText.mock.calls[0][1]).macros).toEqual([{ name: 'hlnote', args: [{ kind: 'o' }, { kind: 'm' }] }]);
	});

	it('writes nothing for a package TeX does not have, and leaves a file already there as it is', async () => {
		probeTexPackage.mockResolvedValue(null);
		expect(await savePackageFile('/work', 'zzmissing')).toBeNull();
		exists.mockResolvedValueOnce(true);
		expect(await savePackageFile('/work', 'labtools')).toBe('/work/.texpile/packages/labtools.json');
		expect(writeText).not.toHaveBeenCalled();
		expect(probeTexPackage).toHaveBeenCalledTimes(1);
	});
});
