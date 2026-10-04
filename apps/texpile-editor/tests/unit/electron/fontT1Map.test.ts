import { it, expect, vi, afterAll } from 'vitest';
import { mkdtempSync, writeFileSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

const tex = vi.hoisted(() => ({ year: '2025', maps: {} as Record<string, string> }));
vi.mock('node:child_process', () => ({
	execFile: (_cmd: string, args: string[], _opts: unknown, cb: (err: unknown, stdout: string) => void) =>
		cb(null, args[0] === 'pdftex.map' ? tex.maps[tex.year] : `/texlive/${tex.year}/fonts/${args[0]}`)
}));
vi.mock('../../../../../electron/src/shell/shellEnv', () => ({ shellEnvReady: async () => {} }));

import { resolveType1 } from '../../../../../electron/src/fontT1Map';
import { applyToolDirs, pathKey, setToolDirs } from '../../../../../electron/src/shell/toolDirs';

const dir = mkdtempSync(join(tmpdir(), 'texpile-fontmap-'));
const savedPath = process.env[pathKey()];
afterAll(() => {
	setToolDirs([]);
	process.env[pathKey()] = savedPath;
	rmSync(dir, { recursive: true, force: true });
});

function map(year: string, pfb: string): void {
	tex.maps[year] = join(dir, `pdftex-${year}.map`);
	writeFileSync(tex.maps[year], `ptmr8r Times-Roman " TeXBase1Encoding ReEncodeFont " <8r.enc <${pfb}\n`);
}

it('reads the font map of the TeX the Toolchain folders put first', async () => {
	map('2025', 'utmr8a.pfb');
	map('2024', 'ptmr8a.pfb');
	const before = { t: 'font', name: 'ptmr8r' } as Record<string, unknown>;
	await resolveType1(before);
	expect(before.t1).toEqual({ pfb: '/texlive/2025/fonts/utmr8a.pfb', enc: '/texlive/2025/fonts/8r.enc' });
	tex.year = '2024';
	applyToolDirs();
	setToolDirs(['/usr/local/texlive/2024/bin/x86_64-linux']);
	const after = { t: 'font', name: 'ptmr8r' } as Record<string, unknown>;
	await resolveType1(after);
	expect(after.t1).toEqual({ pfb: '/texlive/2024/fonts/ptmr8a.pfb', enc: '/texlive/2024/fonts/8r.enc' });
});
