// Parse and generate the LaTeX compile command: engine chips, output directory, and the
// expected PDF/log paths the preview, log parser, and SyncTeX all rely on. Pure string logic.

import { basename, dirname, joinPath } from './fileSystem';
import { isTypstCommand, typstLogPath, typstOutDir, typstPdfPath } from './typstCommand';

export type Engine = 'pdflatex' | 'lualatex' | 'xelatex';
const ENGINE_FLAG: Record<Engine, string> = { pdflatex: '-pdf', lualatex: '-lualatex', xelatex: '-xelatex' };

export function isEngine(value: unknown): value is Engine {
	return typeof value === 'string' && Object.hasOwn(ENGINE_FLAG, value);
}

/** the command's -output-directory / -outdir value, or '.' if none. */
export function compileOutDir(cmd: string): string {
	// Typst has no output-directory flag; its build directory is implied by the output argument
	if (isTypstCommand(cmd)) return typstOutDir(cmd);
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

/**
 * latexmk's -cd: run the compile in the main file's own directory.
 *
 * Without it the compile runs in the workspace root, and TeX resolves \input against the WORKING
 * directory rather than the source file - so a main file in a subfolder cannot find its own
 * siblings. `-cd-` is the explicit OFF form and must not read as on.
 */
export function usesCd(cmd: string): boolean {
	return /(?:^|\s)-cd(?![-\w])/.test(cmd);
}

/**
 * The directory the compile actually RUNS IN, which every generated path is relative to.
 *
 * Under -cd that is the main file's folder, so `-output-directory=output` means <main's
 * folder>/output and the engine's file:line errors come back relative to it too. Everywhere else
 * it is the workspace root, which is where the terminal spawns.
 */
export function compileBaseDir(cmd: string, root: string | null, main: string | null): string | null {
	if (!root) return null;
	if (!main || isTypstCommand(cmd) || !usesCd(cmd)) return root;
	const dir = dirname(main); // always forward-slashed; keep the root's own separator style so the
	if (!dir) return root; // paths built from this stay native (a mixed C:\ws/sub misses exact matches)
	return root.includes('\\') ? dir.replace(/\//g, '\\') : dir;
}

/**
 * Regenerate a standard command, carrying over the current output dir (default 'output') and -cd.
 *
 * -cd is CARRIED, not imposed: a user who deleted it from the command box keeps it deleted when
 * they click an engine chip, because a control that silently re-adds a flag you removed is the same
 * problem as one that hides it. It comes back only when latexmk itself is switched on, which is a
 * request for the stock latexmk setup - and it is dropped for a bare engine, where `pdflatex -cd`
 * is not a flag at all.
 */
export function buildCompileCommand(engine: Engine, latexmk: boolean, cmd: string): string {
	const cur = compileOutDir(cmd);
	const out = `-output-directory=${cur === '.' ? 'output' : cur}`;
	const flags = `-interaction=nonstopmode -file-line-error -synctex=1 ${out}`;
	const cd = usesCd(cmd) || !usesLatexmk(cmd) ? '-cd ' : '';
	return latexmk ? `latexmk ${cd}${ENGINE_FLAG[engine]} ${flags} {main}` : `${engine} ${flags} {main}`;
}

/**
 * A directory name safe to splice into the compile command, or null.
 *
 * This is the whole defence for the MCP set_output_paths tool, the only tool that reaches the
 * compile command at all, and the only thing separating "retarget the build output" from "run an
 * extra command" is what is allowed through here - the value lands inside a string that a shell
 * will parse.
 *
 * Backslashes are folded to forward slashes rather than permitted: a backslash is an escape to a
 * POSIX shell, and every TeX engine accepts forward slashes on Windows anyway, so folding removes
 * the character without costing Windows callers anything. A space is legal but gets quoted, since
 * an unquoted one would split the flag into two arguments.
 */
export function sanitizeOutputDir(dir: string): string | null {
	const d = dir.trim().replace(/\\/g, '/');
	if (!d) return null;
	// leading (drive|root) then an ordinary path. The first character may not be '-', or the engine
	// reads the whole value as another flag
	if (!/^(\/|[A-Za-z]:\/)?[A-Za-z0-9._][A-Za-z0-9._/ -]*$/.test(d)) return null;
	return d.includes(' ') ? `"${d}"` : d;
}

/**
 * Point an EXISTING command at a different output directory, leaving the rest of it alone.
 *
 * Deliberately a substitution rather than a regeneration: buildCompileCommand rewrites the command
 * from an engine guess, which is right when the user picked an engine chip and wrong here, where
 * the command may be latexmk with flags, a Makefile target, or a wrapper script whose other
 * arguments were put there on purpose.
 *
 * `dir` must already have been through sanitizeOutputDir.
 */
export function withOutputDir(cmd: string, dir: string): string {
	const flag = /-(output-directory|outdir)([=\s]+)("[^"]*"|'[^']*'|\S+)/;
	if (flag.test(cmd)) return cmd.replace(flag, (_m, name: string, sep: string) => `-${name}${sep}${dir}`);
	// no flag to replace: it has to land before {main}, because a trailing argument after the file
	// name is ignored by some engines and taken as a second job name by others
	return cmd.includes('{main}') ? cmd.replace('{main}', () => `-output-directory=${dir} {main}`) : `${cmd} -output-directory=${dir}`;
}

// a Windows drive (C:\), or a POSIX/UNC leading separator
function isAbsolutePath(p: string) {
	return /^([a-zA-Z]:[\\/]|[\\/])/.test(p);
}

/** a user-entered override: absolute stays as-is, else it's relative to the folder root. */
export function resolveOutputPath(root: string, p: string): string {
	return isAbsolutePath(p) ? p : joinPath(root, p);
}

// DETECTED (not overridden) PDF path, from the command + main file: <base>/<outdir>/<main>.pdf,
// where the base is the directory the command runs in (see compileBaseDir - the root, or the main
// file's folder under -cd)
export function detectedPdfPath(cmd: string, root: string | null, main: string | null): string | null {
	if (isTypstCommand(cmd)) return typstPdfPath(cmd, root, main);
	if (!root || !main) return null;
	const base = compileBaseDir(cmd, root, main) ?? root;
	const pdf = basename(main).replace(/\.tex$/i, '') + '.pdf';
	const dir = compileOutDir(cmd);
	return dir === '.' ? joinPath(base, pdf) : joinPath(joinPath(base, dir), pdf);
}

// DETECTED log: <jobname>.log next to the actual PDF, unless an aux directory (latexmk -auxdir /
// MiKTeX -aux-directory) redirects it
export function detectedLogPath(cmd: string, root: string | null, main: string | null, pdfOverride?: string): string | null {
	// Typst writes no log; the generated command redirects stderr into one, and that redirect is
	// the only thing that names it. Without one there is genuinely no log to watch.
	if (isTypstCommand(cmd)) return typstLogPath(cmd, root);
	const pdf = expectedPdfPath(cmd, root, main, pdfOverride);
	if (!pdf) return null;
	const aux = cmd.match(/-(?:aux-directory|auxdir)[=\s]+("[^"]*"|'[^']*'|\S+)/);
	const log = basename(pdf).replace(/\.pdf$/i, '.log');
	if (aux && aux[1]) {
		if (!root) return null;
		// same base as the PDF: an aux dir is relative to wherever the command runs
		const base = compileBaseDir(cmd, root, main) ?? root;
		return joinPath(joinPath(base, aux[1].replace(/^["']|["']$/g, '')), log);
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
