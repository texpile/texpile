import { describe, it, expect } from 'vitest';
import {
	isTypstCommand,
	drivesTypst,
	buildTypstCommand,
	typstJobName,
	typstLogArg,
	typstOutDir,
	typstPdfArg,
	typstPdfPath,
	typstLogPath,
	shellWord
} from '$lib/workspace/typstCommand';
import { compileOutDir, detectedPdfPath, detectedLogPath } from '$lib/workspace/compileCommand';

const ROOT = 'C:/proj';

describe('isTypstCommand', () => {
	it('matches tinymist and typst at the head of the line', () => {
		expect(isTypstCommand('tinymist compile --root . {main} out/main.pdf')).toBe(true);
		expect(isTypstCommand('typst compile {main}')).toBe(true);
		expect(isTypstCommand('  typst.exe compile {main}')).toBe(true);
		expect(isTypstCommand('/usr/local/bin/typst compile {main}')).toBe(true);
	});

	it('does not match a TeX command', () => {
		expect(isTypstCommand('latexmk -lualatex -output-directory=output {main}')).toBe(false);
		expect(isTypstCommand('pdflatex {main}')).toBe(false);
	});

	it('does not match typst appearing as an argument', () => {
		// a --root pointing at a folder called typst is not a typst command
		expect(isTypstCommand('latexmk --root ./typst {main}')).toBe(false);
	});
});

describe('drivesTypst', () => {
	// the support case: an empty log after this command means "compiled clean", and treating it
	// the TeX way ("never ran") left the previous failure on the Problems panel forever
	it('sees through a leading cd, in every shell chain style', () => {
		expect(drivesTypst('cd .. && tinymist compile --root . ./FOO/book.typ out.pdf 2>out.log')).toBe(true);
		expect(drivesTypst('cd .. ; tinymist compile --root . {main}')).toBe(true);
		expect(drivesTypst('cd .. & typst compile {main}')).toBe(true);
	});

	it('agrees with isTypstCommand on plain commands', () => {
		expect(drivesTypst('tinymist compile --root . {main} out/main.pdf')).toBe(true);
		expect(drivesTypst('latexmk -pdf {main}')).toBe(false);
		expect(drivesTypst('cd .. && latexmk -pdf {main}')).toBe(false);
	});
});

describe('argument parsing', () => {
	const CMD = 'tinymist compile --root . {main} output/main.pdf 2>output/main.log';

	it('reads the positional output, skipping flag values', () => {
		expect(typstPdfArg(CMD)).toBe('output/main.pdf');
	});

	it('returns null when only an input was given', () => {
		// typst then defaults the PDF to the input's name, so there is no explicit output
		expect(typstPdfArg('typst compile main.typ')).toBeNull();
	});

	it('does not mistake a --root value for the output', () => {
		expect(typstPdfArg('tinymist compile --root ./src main.typ')).toBeNull();
		expect(typstPdfArg('tinymist compile --root ./src main.typ out.pdf')).toBe('out.pdf');
	});

	it('handles --flag=value as one token', () => {
		expect(typstPdfArg('tinymist compile --root=. main.typ out/x.pdf')).toBe('out/x.pdf');
	});

	it('reads the stderr redirect', () => {
		expect(typstLogArg(CMD)).toBe('output/main.log');
		expect(typstLogArg('typst compile main.typ 2> "out dir/main.log"')).toBe('out dir/main.log');
		expect(typstLogArg('typst compile main.typ')).toBeNull();
	});

	it('keeps redirect targets out of the positional list', () => {
		expect(typstPdfArg('typst compile main.typ 2>out/main.log')).toBeNull();
	});

	it('handles quoted paths', () => {
		expect(typstPdfArg('tinymist compile --root . "my doc.typ" "out dir/my doc.pdf"')).toBe('out dir/my doc.pdf');
	});
});

describe('typstOutDir', () => {
	it('derives the build directory from the output argument', () => {
		expect(typstOutDir('tinymist compile --root . {main} output/main.pdf')).toBe('output');
		expect(typstOutDir('tinymist compile --root . {main} build/pdf/main.pdf')).toBe('build/pdf');
	});

	it('is the root when the output sits beside the source', () => {
		expect(typstOutDir('tinymist compile --root . {main} main.pdf')).toBe('.');
		expect(typstOutDir('tinymist compile --root . {main}')).toBe('.');
	});

	it('falls back to the log target when there is no pdf argument', () => {
		expect(typstOutDir('typst compile main.typ 2>out/main.log')).toBe('out');
	});
});

describe('buildTypstCommand', () => {
	it('names the outputs after the main file', () => {
		expect(buildTypstCommand('C:/proj/thesis.typ')).toBe('tinymist compile --root . {main} output/thesis.pdf 2>output/thesis.log');
	});

	it('falls back to main when there is no main file', () => {
		expect(buildTypstCommand(null)).toContain('output/main.pdf');
	});

	it('emits forward slashes only (Typst 0.15 rejects backslashes in paths)', () => {
		expect(buildTypstCommand('C:\\proj\\report.typ', 'build\\out')).toBe(
			'tinymist compile --root . {main} build/out/report.pdf 2>build/out/report.log'
		);
	});

	it('round-trips through its own parsers', () => {
		const cmd = buildTypstCommand('C:/proj/paper.typ');
		expect(typstPdfArg(cmd)).toBe('output/paper.pdf');
		expect(typstLogArg(cmd)).toBe('output/paper.log');
		expect(typstOutDir(cmd)).toBe('output');
	});

	it('keeps a main file named with shell syntax one argument of the command line', () => {
		const cmd = buildTypstCommand('/proj/a;touch pwned;.typ');
		expect(cmd).toBe("tinymist compile --root . {main} 'output/a;touch pwned;.pdf' 2>'output/a;touch pwned;.log'");
		expect(typstPdfArg(cmd)).toBe('output/a;touch pwned;.pdf');
		expect(typstLogArg(cmd)).toBe('output/a;touch pwned;.log');
	});
});

describe('typstJobName', () => {
	it('strips the directory and extension', () => {
		expect(typstJobName('C:/proj/sub/report.typ')).toBe('report');
		expect(typstJobName('report.typ')).toBe('report');
		expect(typstJobName(null)).toBe('main');
	});

	it('strips a non-.typ extension too', () => {
		// the Format switch can be flipped while a LaTeX project is open; the output must not be
		// named main.tex.pdf
		expect(typstJobName('C:/proj/main.tex')).toBe('main');
		expect(buildTypstCommand('C:/proj/main.tex')).toContain('output/main.pdf');
	});

	it('keeps interior dots', () => {
		expect(typstJobName('paper.final.typ')).toBe('paper.final');
	});

	it('survives a name with no extension', () => {
		expect(typstJobName('C:/proj/Makefile')).toBe('Makefile');
	});
});

describe('absolute path derivation', () => {
	const CMD = buildTypstCommand('C:/proj/main.typ');

	it('resolves the pdf against the root', () => {
		expect(typstPdfPath(CMD, ROOT, 'C:/proj/main.typ')).toBe('C:/proj/output/main.pdf');
	});

	it("uses typst's own default when the command names no output", () => {
		expect(typstPdfPath('typst compile main.typ', ROOT, 'C:/proj/main.typ')).toBe('C:/proj/main.pdf');
	});

	it('has no log path without a redirect', () => {
		expect(typstLogPath('typst compile main.typ', ROOT)).toBeNull();
	});
});

describe('compileCommand dispatches Typst commands', () => {
	const CMD = buildTypstCommand('C:/proj/main.typ');

	it('routes detectedPdfPath', () => {
		expect(detectedPdfPath(CMD, ROOT, 'C:/proj/main.typ')).toBe('C:/proj/output/main.pdf');
	});

	it('routes detectedLogPath to the redirect, not to <pdf>.log', () => {
		expect(detectedLogPath(CMD, ROOT, 'C:/proj/main.typ')).toBe('C:/proj/output/main.log');
	});

	it('routes compileOutDir so the pipeline creates the build directory', () => {
		expect(compileOutDir(CMD)).toBe('output');
	});

	it('leaves LaTeX commands alone', () => {
		const tex = 'latexmk -lualatex -output-directory=out {main}';
		expect(compileOutDir(tex)).toBe('out');
		expect(detectedPdfPath(tex, ROOT, 'C:/proj/main.tex')).toBe('C:/proj/out/main.pdf');
		expect(detectedLogPath(tex, ROOT, 'C:/proj/main.tex')).toBe('C:/proj/out/main.log');
	});
});

describe('shellWord', () => {
	it('quotes for cmd.exe on Windows, where a name may hold & but never a double quote', () => {
		expect(shellWord('a&calc.tex', true)).toBe('"a&calc.tex"');
		expect(shellWord('sections/main.tex', true)).toBe('sections/main.tex');
	});
});
