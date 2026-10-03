// Reading "a program was missing, and it was THIS one" out of compile output.
//
// The rule the old version got wrong, kept here as the last two cases: the name has to come from
// the LINE, not from the command. Matching the command's first word blamed `make` for its child's
// absence, and stayed silent when the default `latexmk -lualatex` was missing only the engine.
import { describe, it, expect } from 'vitest';
import { missingProgram, programNotFound, redirectsStderr } from '$lib/workspace/toolMissing';

describe('missingProgram', () => {
	const SHELLS: Record<string, string> = {
		bash: 'bash: latexmk: command not found',
		'bash with line number': '/usr/bin/bash: line 1: latexmk: command not found',
		zsh: 'zsh: command not found: latexmk',
		dash: 'sh: 1: latexmk: not found',
		cmd: "'latexmk' is not recognized as an internal or external command,\noperable program or batch file.",
		powershell: "latexmk : The term 'latexmk' is not recognized as a name of a cmdlet, function, script file, or executable program."
	};

	for (const [shell, output] of Object.entries(SHELLS)) {
		it(`names the program from ${shell}`, () => {
			expect(missingProgram(output)).toBe('latexmk');
		});
	}

	it('finds the line among a run of ordinary output', () => {
		expect(missingProgram(['Compiling…', 'bash: tectonic: command not found', 'done'].join('\n'))).toBe('tectonic');
	});

	// the false positive the patterns are shaped around: a TeX log is full of "not found"
	it('does not mistake a missing package for a missing program', () => {
		const out = [
			'Latexmk: This is Latexmk, John Collins, 2024',
			"! LaTeX Error: File `geometry.sty' not found.",
			'Latexmk: Errors, so I did not complete making targets'
		].join('\n');
		expect(missingProgram(out)).toBeNull();
	});

	it('says nothing for empty or clean output', () => {
		expect(missingProgram('')).toBeNull();
		expect(missingProgram('Output written on main.pdf (12 pages).')).toBeNull();
	});

	// `X: not found` is the one shape with no "command" in it to anchor on, and ordinary log prose
	// hits that shape. Hence the shell prefix requirement - without it the first line below
	// reported `mode`. Everything here is text a real compile can print.
	it('ignores ordinary log text that merely reads like a not-found', () => {
		for (const line of [
			'entering extended mode: not found by the user',
			'This section: not found in the index',
			'error: file not found (searched at ./missing.typ)',
			'! Package biblatex Error: File main.bbl not found.',
			"Package fontspec Info: Font family 'Fake' not found."
		]) {
			expect(missingProgram(line), line).toBeNull();
		}
	});

	it('still reads the shells that use that phrasing', () => {
		expect(missingProgram('/bin/sh: 1: gs: not found')).toBe('gs');
		expect(missingProgram('sh: 1: latexmk: not found')).toBe('latexmk');
	});

	it('strips a directory and .exe from the reported name', () => {
		expect(missingProgram("'C:\\texlive\\bin\\latexmk.exe' is not recognized as an internal or external command,")).toBe('latexmk');
		expect(missingProgram('bash: /opt/texbin/xelatex: command not found')).toBe('xelatex');
	});

	// ---- the two the old first-word matcher got wrong ----

	it('blames the child, not the wrapper that reported it', () => {
		// make IS installed; pdflatex is the one to go and get
		expect(missingProgram('make: pdflatex: Command not found')).toBe('pdflatex');
	});

	it('reports an engine the compile command does not name', () => {
		// `latexmk -lualatex ...` with latexmk present and lualatex absent: used to be silent
		expect(missingProgram('bash: lualatex: command not found')).toBe('lualatex');
		expect(missingProgram('bash: biber: command not found')).toBe('biber');
	});
});

describe('redirectsStderr', () => {
	it('spots the redirect that hides the shell error from the terminal', () => {
		// the Typst default: without this the missing-tool line goes to the log unnoticed
		expect(redirectsStderr('tinymist compile --root . {main} output/x.pdf 2>output/x.log')).toBe(true);
		expect(redirectsStderr('cmd &>all.log')).toBe(true);
	});

	it('is false for a command that leaves stderr alone', () => {
		expect(redirectsStderr('latexmk -lualatex -output-directory=output {main}')).toBe(false);
		// a plain stdout redirect still leaves stderr on the terminal
		expect(redirectsStderr('latexmk {main} >out.txt')).toBe(false);
	});
});

describe('programNotFound', () => {
	it('reads the program out of the way main words one it could not run', () => {
		expect(
			programNotFound(new Error('latexindent was not found on PATH. It ships with most LaTeX distributions (TeX Live, MiKTeX).'))
		).toBe('latexindent');
		expect(programNotFound('synctex was not found on PATH. It ships with TeX distributions.')).toBe('synctex');
		expect(programNotFound(new Error('tinymist was not found on PATH.'))).toBe('tinymist');
	});

	it('leaves any other failure to say itself', () => {
		expect(programNotFound(new Error('latexindent produced no output.'))).toBeNull();
		expect(programNotFound(new Error('tinymist is not available'))).toBeNull();
		expect(programNotFound(undefined)).toBeNull();
	});
});
