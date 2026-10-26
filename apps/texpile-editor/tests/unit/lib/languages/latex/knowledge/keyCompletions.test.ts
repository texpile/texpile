import { describe, expect, it } from 'vitest';
import { keysForMacro, packageOptions } from '$lib/languages/latex/knowledge/keyCompletions';
import { loadFiles } from '$lib/languages/latex/knowledge/loadedFiles';

describe('packageOptions', () => {
	it("offers the options a class hands on to the class it loads (llncs's go to article)", async () => {
		const keys = ((await packageOptions(['class-llncs']))?.keys ?? []).map((k) => k.key);
		expect(keys).toContain('runningheads');
		expect(keys).toContain('a4paper');
	});
});

describe('keysForMacro', () => {
	it('offers the keys of a package the document does not load only for a name no loaded file defines', async () => {
		const tikzCd = await loadFiles([{ name: 'tikz-cd', options: [] }], [], null);
		expect(await keysForMacro('arrow', ['[]'], tikzCd)).toBeNull();
		expect((await keysForMacro('arrow', ['[]'], []))?.keys.length).toBeGreaterThan(0);
	});
});
