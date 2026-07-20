// Parse and generate the LaTeX compile command: engine chips, output directory, and the
// expected PDF/log paths the preview, log parser, and SyncTeX all rely on. Pure string logic.

import { basename, joinPath } from './fileSystem';

export type Engine = 'pdflatex' | 'lualatex' | 'xelatex';
const ENGINE_FLAG: Record<Engine, string> = { pdflatex: '-pdf', lualatex: '-lualatex', xelatex: '-xelatex' };

/** the command's -output-directory / -outdir value, or '.' if none. */
export function compileOutDir(cmd: string): string {
	const m = cmd.match(/-(?:output-directory|outdir)[=\s]+("[^"]*"|'[^']*'|\S+)/);
	return m && m[1] ? m[1].replace(/^["']|["']$/g, '') : '.';
}

// null for anything we don't recognize (make, arara, tectonic, a script, multi-engine), so no
// engine chip lights up rather than mislabeling it
export function detectEngine(cmd: string): Engine | null {
	if (/\b(lualatex|pdflua)\b/.test(cmd)) return 'lualatex';
	if (/\b(xelatex|pdfxe)\b/.test(cmd)) return 'xelatex';
	if (/\bpdflatex\b/.test(cmd)) return 'pdflatex';
	if (/\blatexmk\b/.test(cmd) && /\bpdf\b/.test(cmd)) return 'pdflatex'; // latexmk -pdf defaults to pdflatex
	return null;
}

export function usesLatexmk(cmd: string): boolean {
	return /\blatexmk\b/.test(cmd);
}

/** regenerate a standard command, carrying over the current output dir (default 'output'). */
export function buildCompileCommand(engine: Engine, latexmk: boolean, cmd: string): string {
	const cur = compileOutDir(cmd);
	const out = `-output-directory=${cur === '.' ? 'output' : cur}`;
	const flags = `-interaction=nonstopmode -file-line-error -synctex=1 ${out}`;
	return latexmk ? `latexmk ${ENGINE_FLAG[engine]} ${flags} {main}` : `${engine} ${flags} {main}`;
}

// a Windows drive (C:\), or a POSIX/UNC leading separator
const isAbsolutePath = (p: string) => /^([a-zA-Z]:[\\/]|[\\/])/.test(p);

/** a user-entered override: absolute stays as-is, else it's relative to the folder root. */
export function resolveOutputPath(root: string, p: string): string {
	return isAbsolutePath(p) ? p : joinPath(root, p);
}

// DETECTED (not overridden) PDF path, from the command + main file: <root>/<outdir>/<main>.pdf
export function detectedPdfPath(cmd: string, root: string | null, main: string | null): string | null {
	if (!root || !main) return null;
	const pdf = basename(main).replace(/\.tex$/i, '') + '.pdf';
	const dir = compileOutDir(cmd);
	return dir === '.' ? joinPath(root, pdf) : joinPath(joinPath(root, dir), pdf);
}

// DETECTED log: <jobname>.log next to the actual PDF, unless an aux directory (latexmk -auxdir /
// MiKTeX -aux-directory) redirects it
export function detectedLogPath(cmd: string, root: string | null, main: string | null, pdfOverride?: string): string | null {
	const pdf = expectedPdfPath(cmd, root, main, pdfOverride);
	if (!pdf) return null;
	const aux = cmd.match(/-(?:aux-directory|auxdir)[=\s]+("[^"]*"|'[^']*'|\S+)/);
	const log = basename(pdf).replace(/\.pdf$/i, '.log');
	if (aux && aux[1]) {
		if (!root) return null;
		return joinPath(joinPath(root, aux[1].replace(/^["']|["']$/g, '')), log);
	}
	return pdf.replace(/\.pdf$/i, '.log');
}

// ACTUAL PDF/log the preview, log parser, and SyncTeX use: the folder's manual override wins, else
// the detected path
export function expectedPdfPath(cmd: string, root: string | null, main: string | null, pdfOverride?: string): string | null {
	return root && pdfOverride ? resolveOutputPath(root, pdfOverride) : detectedPdfPath(cmd, root, main);
}
export function expectedLogPath(
	cmd: string,
	root: string | null,
	main: string | null,
	overrides?: { pdf?: string; log?: string }
): string | null {
	return root && overrides?.log ? resolveOutputPath(root, overrides.log) : detectedLogPath(cmd, root, main, overrides?.pdf);
}

// the Advanced output paths are LITERAL file paths, one file each: {main} is NOT expanded, and each
// must be an actual .pdf/.log. Returns a machine code the caller maps to a localized warning.
export type OutputPathIssue = 'has-token' | 'wrong-ext' | null;
export function outputPathIssue(v: string, ext: '.pdf' | '.log'): OutputPathIssue {
	if (!v.trim()) return null;
	if (/\{[^}]*\}/.test(v)) return 'has-token';
	if (!v.trim().toLowerCase().endsWith(ext)) return 'wrong-ext';
	return null;
}
