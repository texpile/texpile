// A guest asked for GIT~1/config and got the host's .git/config: the name check never saw ".git".
import { afterAll, describe, expect, it } from 'vitest';
import * as fs from 'node:fs';
import * as os from 'node:os';
import * as path from 'node:path';
import { resolveSharedTarget } from '$lib/collab/sharedPathGuard';
import { resolveRealRelative } from '../../../../../../electron/src/fs/resolveRealRelative';

const root = fs.realpathSync(fs.mkdtempSync(path.join(os.tmpdir(), 'texpile-guard-')));
fs.mkdirSync(path.join(root, '.git'));
fs.writeFileSync(path.join(root, '.git', 'config'), '[remote "origin"]\n');
fs.writeFileSync(path.join(root, 'main.tex'), '\\begin{document}\n');
// a junction needs no privileges on Windows; elsewhere a plain dir link
fs.symlinkSync(path.join(root, '.git'), path.join(root, 'vcs'), process.platform === 'win32' ? 'junction' : 'dir');
const shortNames = process.platform === 'win32' && fs.existsSync(path.join(root, 'GIT~1'));
afterAll(() => fs.rmSync(root, { recursive: true, force: true }));

function target(rel: string) {
	return resolveSharedTarget(root, rel, resolveRealRelative);
}

describe('resolveSharedTarget', () => {
	it('keeps shared files and new uploads where they land', async () => {
		expect(await target('main.tex')).toBe('main.tex');
		expect(await target('figures/new.png')).toBe('figures/new.png');
	});

	it('refuses a path that resolves into .git, for reads and for uploads', async () => {
		expect(await resolveRealRelative(root, 'vcs/hooks/pre-commit')).toBe('.git/hooks/pre-commit');
		for (const rel of ['vcs/config', 'vcs/hooks/pre-commit', '.GIT/config']) expect(await target(rel), rel).toBeNull();
	});

	it.runIf(shortNames)('refuses the 8.3 short name of .git', async () => {
		expect(await resolveRealRelative(root, 'GIT~1/config')).toBe('.git/config');
		for (const rel of ['GIT~1/config', 'GIT~1/hooks/pre-commit', 'GIT~1::$INDEX_ALLOCATION/hooks/pre-commit']) {
			expect(await target(rel), rel).toBeNull();
		}
	});
});
