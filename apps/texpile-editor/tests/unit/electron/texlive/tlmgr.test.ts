import { afterAll, expect, it } from 'vitest';
import * as fs from 'node:fs';
import * as os from 'node:os';
import * as path from 'node:path';
import { runTlmgr } from '../../../../../../electron/src/texlive/tlmgr';

const bin = fs.mkdtempSync(path.join(os.tmpdir(), 'texpile-tlmgr-'));
afterAll(() => fs.rmSync(bin, { recursive: true, force: true }));

it.skipIf(process.platform === 'win32')('hands over each line tlmgr prints while it runs', async () => {
	fs.writeFileSync(
		path.join(bin, 'tlmgr'),
		'#!/bin/sh\necho "[1/1] install: siunitx"\necho "tlmgr: cannot reach the mirror" >&2\nexit 3\n',
		{ mode: 0o755 }
	);
	const said: string[] = [];
	const done = await runTlmgr(bin, ['install', 'siunitx'], (line) => said.push(line));
	expect(said.sort()).toEqual(['[1/1] install: siunitx', 'tlmgr: cannot reach the mirror']);
	expect(done.code).toBe(3);
	expect(done.out).toContain('cannot reach the mirror');
});
