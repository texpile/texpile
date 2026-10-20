import { describe, expect, it } from 'vitest';
import { documentPackages } from '$lib/languages/latex/intellisense/packages/loadedPackages';
import { stackedCommands } from '$lib/languages/latex/knowledge/stackedEntries';

describe('stackedCommands', () => {
	it('keeps what a file below said of each argument when a file lists the command again with the same arguments', async () => {
		const revtex = stackedCommands(await documentPackages('\\documentclass{revtex4-2}\n'));
		expect(revtex.get('url')?.args?.[0]).toMatchObject({ kind: 'm', role: 'url' });
		const amsart = stackedCommands(await documentPackages('\\documentclass{amsart}\n'));
		expect(amsart.get('newtheorem')?.args?.find((a) => a.defines)).toMatchObject({ defines: 'new' });
	});
});
