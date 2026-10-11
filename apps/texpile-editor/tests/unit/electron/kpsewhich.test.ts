import { it, expect, vi, afterEach } from 'vitest';

const tex = vi.hoisted(() => ({ reachable: false, year: '2025', calls: 0 }));
vi.mock('node:child_process', () => ({
	execFile: (_cmd: string, args: string[], _opts: unknown, cb: (err: unknown, stdout: string) => void) => {
		tex.calls++;
		if (!tex.reachable) return cb(Object.assign(new Error('spawn kpsewhich ENOENT'), { code: 'ENOENT' }), '');
		const stdout = args
			.filter((a) => !a.startsWith('missing'))
			.map((a) => `/usr/local/texlive/${tex.year}/texmf-dist/${a}\n`)
			.join('');
		cb(args.some((a) => a.startsWith('missing')) ? Object.assign(new Error('exit 1'), { code: 1 }) : null, stdout);
	}
}));
vi.mock('../../../../../electron/src/shell/shellEnv', () => ({ shellEnvReady: async () => {} }));

import { kpsewhich } from '../../../../../electron/src/shell/kpsewhich';
import { applyToolDirs, pathKey, setToolDirs } from '../../../../../electron/src/shell/toolDirs';

const savedPath = process.env[pathKey()];
afterEach(() => {
	process.env[pathKey()] = savedPath;
});

it('looks again once TeX can be started, and keeps a file TeX does not have', async () => {
	expect(await kpsewhich('IEEEabrv.bib')).toBeNull();
	tex.reachable = true;
	expect(await kpsewhich('IEEEabrv.bib')).toBe('/usr/local/texlive/2025/texmf-dist/IEEEabrv.bib');
	expect(await kpsewhich('missing.bib')).toBeNull();
	const calls = tex.calls;
	expect(await kpsewhich('missing.bib')).toBeNull();
	expect(tex.calls).toBe(calls);
});

it('asks the TeX that a change to the Toolchain folders put first', async () => {
	tex.reachable = true;
	applyToolDirs();
	expect(await kpsewhich('pdftex.map')).toBe('/usr/local/texlive/2025/texmf-dist/pdftex.map');
	tex.year = '2024';
	setToolDirs(['/usr/local/texlive/2024/bin/x86_64-linux']);
	expect(await kpsewhich('pdftex.map')).toBe('/usr/local/texlive/2024/texmf-dist/pdftex.map');
	setToolDirs([]);
});

it('asks for the names wanted together in one run, and a miss among them leaves the others found', async () => {
	tex.reachable = true;
	const calls = tex.calls;
	const found = await Promise.all(['a.sty', 'missing.sty', 'b.sty'].map((f) => kpsewhich(f)));
	expect(found).toEqual(['/usr/local/texlive/2024/texmf-dist/a.sty', null, '/usr/local/texlive/2024/texmf-dist/b.sty']);
	expect(tex.calls).toBe(calls + 1);
});
