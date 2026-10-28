import { describe, expect, it } from 'vitest';
import { OPERATION_BEFORE, pathKeys } from '$lib/languages/latex/intellisense/completion/keys/pathOperations';
import type { LoadedFile } from '$lib/languages/latex/knowledge/loadedFiles';

const withKeys = (name: string, group: string) => ({ name, args: [{ kind: 'o', keys: [`fake#${group}`] }] });
const fake: LoadedFile = {
	id: 'fake',
	name: 'fake',
	options: new Set(),
	layers: [
		{
			version: 1,
			macros: [withKeys('zzpath', 'path'), withKeys('zzscope', 'scope'), { name: 'zzplain', args: [{ kind: 'o' }] }],
			keys: { 'fake#path': [{ key: 'rounded corners', bare: true }], 'fake#scope': [{ key: 'shift', placeholder: 'coord' }] }
		}
	]
};

const keyNames = async (before: string) => (await pathKeys(before, [fake]))?.keys.map((k) => k.key) ?? null;

describe('pathKeys', () => {
	it('takes the options of the nearest command of the statement that has some', async () => {
		expect(await keyNames('\\zzpath[red] (0,0) -- (1,1) ')).toEqual(['rounded corners']);
		expect(await keyNames('\\zzpath \\zzplain[a] \\zzscope[b] (0,0) ')).toEqual(['shift']);
		expect(await keyNames('\\zzpath \\zzplain[a] (0,0) ')).toEqual(['rounded corners']);
	});

	it('stops at the end of the statement and at an environment edge', async () => {
		expect(await keyNames('\\zzpath (0,0) -- (1,1); \\zzplain (2,2) ')).toBeNull();
		expect(await keyNames('\\zzpath\n\\begin{tikzpicture}\n\\zzplain (2,2) ')).toBeNull();
	});
});

describe('OPERATION_BEFORE', () => {
	it('matches an operation word of the path and not a command or a longer word', () => {
		for (const typed of ['(1,1) node[dr', '-- (1,1) edge from parent [', '(a) to[', 'coordinate['])
			expect(OPERATION_BEFORE.test(typed)).toBe(true);
		for (const typed of ['\\node[dr', 'anode[', '(1,1) node[a]{b}[']) expect(OPERATION_BEFORE.test(typed)).toBe(false);
	});
});
