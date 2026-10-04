// @vitest-environment jsdom
// "Recompile from scratch" is latexmk -gg spliced after the latexmk token. It must compose with
// the batch flags and leave anything that is not a leading latexmk alone, since the menu row is
// hidden for those and the splice would otherwise land inside a foreign command.
import { describe, it, expect, vi } from 'vitest';
import { execFileSync } from 'node:child_process';

vi.mock('$lib/workspace/fileSystem', () => ({
	joinPath: (a: string, b: string) => `${a}/${b}`,
	relativeTo: (root: string, p: string) => p.slice(root.length + 1),
	samePath: (a: string, b: string) => a === b,
	basename: (p: string) => p.split(/[\\/]/).pop() ?? p,
	dirname: (p: string) => p.split(/[\\/]/).slice(0, -1).join('/'),
	readTextFile: () => Promise.reject(new Error('no fs in this test')),
	writeTextFile: () => Promise.resolve(),
	statFile: () => Promise.resolve({ exists: false, mtimeMs: 0, size: 0 })
}));

const { expandMain, isLatexmkCommand, withBatchFlags, withCleanAux, withFullRebuild } = await import('$lib/workspace/compileResolve');

describe('withFullRebuild', () => {
	it('splices -gg right after latexmk, ahead of the batch flags', () => {
		const cmd = 'latexmk -cd -lualatex -synctex=1 -output-directory=output main.tex';
		expect(withFullRebuild(cmd)).toBe('latexmk -gg -cd -lualatex -synctex=1 -output-directory=output main.tex');
		expect(withBatchFlags(withFullRebuild(cmd))).toMatch(/^latexmk -interaction=nonstopmode -file-line-error -gg -cd /);
		expect(withFullRebuild('  latexmk.exe -pdf main.tex')).toBe('  latexmk.exe -gg -pdf main.tex');
	});

	it('leaves anything that is not a leading latexmk untouched', () => {
		for (const cmd of ['pdflatex main.tex', 'cd sub && latexmk -pdf main.tex', 'typst compile main.typ', 'make']) {
			expect(isLatexmkCommand(cmd)).toBe(false);
			expect(withFullRebuild(cmd)).toBe(cmd);
			expect(withCleanAux(cmd)).toBe(cmd);
		}
		expect(isLatexmkCommand('latexmk -pdf {main}')).toBe(true);
	});
});

describe('withCleanAux', () => {
	it('splices -c the same way, so the output directory flags still apply to the clean', () => {
		expect(withCleanAux('latexmk -cd -lualatex -output-directory=output main.tex')).toBe(
			'latexmk -c -cd -lualatex -output-directory=output main.tex'
		);
	});
});

describe('expandMain', () => {
	it('hands the shell a main file named with shell syntax as one literal argument', () => {
		expect(expandMain('latexmk -pdf {main}', '/p', '/p/a;touch pwned;.tex')).toBe("latexmk -pdf 'a;touch pwned;.tex'");
		expect(expandMain('latexmk -pdf "{main}"', '/p', '/p/$(touch pwned)/main.tex')).toBe("latexmk -pdf '$(touch pwned)/main.tex'");
		// latexmk reads -pdflatex=CMD as the command to run
		expect(expandMain('latexmk {main}', '/p', '/p/-pdflatex=touch pwned/main.tex')).toBe("latexmk './-pdflatex=touch pwned/main.tex'");
		expect(expandMain('latexmk -pdf {main}', '/p', '/p/sections/main.tex')).toBe('latexmk -pdf sections/main.tex');
	});

	it.skipIf(process.platform === 'win32')('reaches a POSIX shell as the name itself', () => {
		const name = "it's $(echo no) `echo no`.tex";
		expect(execFileSync('sh', ['-c', expandMain('printf %s {main}', '/p', `/p/${name}`)], { encoding: 'utf8' })).toBe(name);
	});
});
