import { it, expect } from 'vitest';
import {
	distroGroups,
	folderFor,
	INSTALL_VALUE,
	languageNote,
	splitPrograms,
	texLiveOffer
} from '../../../../../../src/lib/modals/window/toolchain/toolchainRows';
import type { ToolInfo } from '../../../../../../src/lib/workspace/toolchainCatalog';

const distro = (name: string, dir: string, extra: Partial<ToolDistro> = {}): ToolDistro => ({
	family: 'latex',
	name,
	dir,
	dirs: [dir],
	detail: '',
	onPath: false,
	managed: false,
	...extra
});
const PATH_TL = distro('TeX Live 2025', '/usr/local/texlive/2025/bin/x86_64-linux', { onPath: true });
const MANAGED = distro('TeX Live 2026', '/data/texlive/bin/x86_64-linux', { managed: true });
const STATUS: ManagedTexLiveStatus = { pinned: '2026-r81008', year: 2026, megabytes: 174, installed: null, step: null };

it('lists every install with the one in use checked, then the install from Texpile', () => {
	const groups = distroGroups([PATH_TL, MANAGED], MANAGED, { label: 'Install TeX Live 2026 from Texpile' });
	expect(groups[0].options.map((o) => [o.label, o.checked])).toEqual([
		['TeX Live 2025', false],
		['TeX Live 2026', true]
	]);
	expect(groups[1].options.map((o) => o.value)).toEqual([INSTALL_VALUE]);
	// the copy PATH reaches needs no folder entry, so picking it clears the list
	expect(folderFor([PATH_TL, MANAGED], PATH_TL.dir)).toBeNull();
	expect(folderFor([PATH_TL, MANAGED], MANAGED.dir)).toBe(MANAGED.dir);
});

it('offers the install until Texpile has the pinned year', () => {
	expect(texLiveOffer(STATUS, true)).not.toBeNull();
	const older = { ...STATUS, installed: { bin: MANAGED.dir, detail: 'pdfTeX 3.141592653-2.6-1.40.27 (TeX Live 2025)' } };
	expect(texLiveOffer(older, true)).not.toBeNull();
	const current = { ...STATUS, installed: { bin: MANAGED.dir, detail: 'pdfTeX 3.141592653-2.6-1.40.28 (TeX Live 2026)' } };
	expect(texLiveOffer(current, true)).toBeNull();
	expect(texLiveOffer({ ...STATUS, megabytes: null }, true)).toBeNull();
});

it('keeps a program that has not answered out of the problems', () => {
	const tool = (id: string) => ({ id, name: id }) as ToolInfo;
	const { pending, problems, working } = splitPrograms([
		{ tool: tool('latexmk'), probe: { id: 'latexmk', found: true, command: 'latexmk' } },
		{ tool: tool('biber'), probe: { id: 'biber', found: true, broken: true, timedOut: true, command: 'biber' } },
		{ tool: tool('bibtex'), probe: undefined }
	]);
	expect([pending, problems, working].map((rows) => rows.map((r) => r.tool.id))).toEqual([['bibtex'], ['biber'], ['latexmk']]);
});

it('says Not found only once every program of a language has answered missing', () => {
	const tool = (id: string) => ({ id, name: id }) as ToolInfo;
	const missing = (id: string) => ({ tool: tool(id), probe: { id, found: false, command: id } });
	expect(languageNote([missing('latexmk'), { tool: tool('lualatex'), probe: undefined }], true)).toEqual({ kind: 'checking' });
	expect(languageNote([missing('latexmk'), missing('lualatex')], false)).toEqual({ kind: 'missing' });
	const works = { tool: tool('lualatex'), probe: { id: 'lualatex', found: true, command: 'lualatex' } };
	expect(languageNote([missing('latexmk'), works], false)).toEqual({ kind: 'several', working: 1, total: 2 });
});
