import { afterEach, describe, expect, it } from 'vitest';
import { documentPackages } from '$lib/languages/latex/intellisense/packages/loadedPackages';
import { parsePackageFile, setUserFiles } from '$lib/languages/latex/knowledge/userFiles';
import { stackedCommands } from '$lib/languages/latex/knowledge/stackedEntries';

describe('stackedCommands', () => {
	it('keeps what a file below said of each argument when a file lists the command again with the same arguments', async () => {
		const revtex = stackedCommands(await documentPackages('\\documentclass{revtex4-2}\n'));
		expect(revtex.get('url')?.args?.[0]).toMatchObject({ kind: 'm', role: 'url' });
		const amsart = stackedCommands(await documentPackages('\\documentclass{amsart}\n'));
		expect(amsart.get('newtheorem')?.args?.find((a) => a.defines)).toMatchObject({ defines: 'new' });
	});

	it('lets a folder package file replace what it states over a global one and keep the rest', async () => {
		const file = (macros: object[]) => parsePackageFile(JSON.stringify({ version: 1, macros })).contents!;
		setUserFiles(
			new Map([
				[
					'stacked',
					[
						file([{ name: 'stackone', args: [{ kind: 'm' }], doc: 'Global one' }, { name: 'stackglobal' }]),
						file([{ name: 'stackone', doc: 'Folder one' }, { name: 'stackfolder' }])
					]
				]
			])
		);
		const stacked = stackedCommands(await documentPackages('\\usepackage{stacked}\n'));
		expect(stacked.get('stackone')).toMatchObject({ doc: 'Folder one', args: [{ kind: 'm' }] });
		expect([...stacked.keys()].filter((n) => n.startsWith('stack'))).toEqual(expect.arrayContaining(['stackglobal', 'stackfolder']));
	});
});

afterEach(() => setUserFiles(new Map()));
