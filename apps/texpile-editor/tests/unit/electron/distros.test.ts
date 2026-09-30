import { it, expect, afterAll } from 'vitest';
import * as fs from 'node:fs';
import * as os from 'node:os';
import * as path from 'node:path';
import { candidateBinDirs, distroName, managedDistroDir, typstPlaces } from '../../../../../electron/src/shell/distros';

const exe = process.platform === 'win32' ? 'pdflatex.exe' : 'pdflatex';
const tmp = fs.realpathSync(fs.mkdtempSync(path.join(os.tmpdir(), 'texpile-distros-')));
function bin(...parts: string[]): string {
	const dir = path.join(tmp, ...parts);
	fs.mkdirSync(dir, { recursive: true });
	fs.writeFileSync(path.join(dir, exe), '');
	return dir;
}
afterAll(() => fs.rmSync(tmp, { recursive: true, force: true }));

it('names an install the way its own program does', () => {
	expect(distroName('latex', 'pdfTeX 3.141592653-2.6-1.40.28 (TeX Live 2025)')).toBe('TeX Live 2025');
	expect(distroName('latex', 'MiKTeX-pdfTeX 4.20 (MiKTeX 24.1)')).toBe('MiKTeX 24.1');
	expect(distroName('latex', 'pdfTeX 3.141592653-2.6-1.40.25 (TeX Live 2023/Debian)')).toBe('TeX Live 2023/Debian');
	expect(distroName('latex', 'pdfTeX 3.14 (somewhere else)')).toBe('pdfTeX 3.14 (somewhere else)');
	expect(distroName('typst', 'tinymist\nBuild Git Describe:  v0.13.24\nTypst Version:       0.13.1')).toBe(
		'Typst 0.13.1, tinymist 0.13.24'
	);
	expect(distroName('typst', 'v24.19.0')).toBeNull();
	// a release build names its own version only in `tinymist -V`, which the probe appends
	const release = 'tinymist \nBuild Git Describe:  VERGEN_IDEMPOTENT_OUTPUT\nTypst Version:       0.15.1';
	expect(distroName('typst', release)).toBe('Typst 0.15.1');
	expect(distroName('typst', `${release}\ntinymist 0.15.8`)).toBe('Typst 0.15.1, tinymist 0.15.8');
});

it('finds every bin folder holding the program, the PATH one first and each of them once', () => {
	const tl2024 = bin('texlive', '2024', 'bin', 'windows');
	const tl2025 = bin('texlive', '2025', 'bin', 'windows');
	const miktex = bin('miktex', 'bin', 'x64');
	const extra = bin('elsewhere', 'bin');
	fs.mkdirSync(path.join(tmp, 'texlive', 'texmf-local'));
	const found = candidateBinDirs(
		{
			program: 'pdflatex',
			yearRoots: [path.join(tmp, 'texlive'), path.join(tmp, 'nope')],
			binDirs: [miktex, path.join(tmp, 'missing')],
			pathDirs: [path.join(tmp, 'bin'), tl2024]
		},
		[extra, tl2025]
	);
	expect(found).toEqual([
		{ dir: tl2024, dirs: [tl2024], onPath: true },
		{ dir: tl2025, dirs: [tl2025], onPath: false },
		{ dir: miktex, dirs: [miktex], onPath: false },
		{ dir: extra, dirs: [extra], onPath: false }
	]);
});

// MacTeX: a folder of symlinks on PATH and in the list; the picker must know the folder the user wrote
it('reaches an install through a linked folder and remembers that folder too', () => {
	const real = bin('texlive', '2026', 'bin', 'universal-darwin');
	const link = path.join(tmp, 'texbin');
	fs.symlinkSync(real, link, 'junction');
	const found = candidateBinDirs({ program: 'pdflatex', yearRoots: [], binDirs: [], pathDirs: [link] }, [link, real]);
	expect(found).toEqual([{ dir: real, dirs: [link, real], onPath: true }]);
});

// a Mac home is reached through a link, so userData and the found install's folder are spelled apart
it("spells the folder of Texpile's own tinymist the way the found install is, through a linked data folder", () => {
	const data = path.join(tmp, 'data');
	fs.mkdirSync(path.join(data, 'tinymist'), { recursive: true });
	fs.writeFileSync(path.join(data, 'tinymist', process.platform === 'win32' ? 'tinymist.exe' : 'tinymist'), '');
	const linked = path.join(tmp, 'linked-data');
	fs.symlinkSync(data, linked, 'junction');
	const [found] = candidateBinDirs({ ...typstPlaces(linked), pathDirs: [] });
	expect(managedDistroDir(linked)).toBe(found.dir);
});
