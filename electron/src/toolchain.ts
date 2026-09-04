// "Is it installed, and which one?" for every external program Texpile shells out to.
//
// Texpile depends on six or so binaries it does not ship - the TeX engines, latexmk, biber/bibtex,
// latexindent, synctex, git, and now tinymist - and until this existed, all but one of them failed
// the same way: silently, with no way for a user to tell a missing program from a broken one.
//
// Deliberately a PROBE, not a resolver: it reports what it found and where, and never installs or
// modifies anything.
import { execFile } from 'node:child_process';
import { timeSync } from './startupStats';
import { shellEnvReady } from './shell/shellEnv';

export type ToolProbe = {
	id: string;
	found: boolean;
	/** first informative line of the tool's own version output, when it gave one */
	detail?: string;
	/** the command probed, as spawned (a bare name means it came from PATH) */
	command: string;
};

/**
 * The line worth showing a user.
 *
 * Not a version NUMBER: these tools disagree wildly about how to print one - `pdfTeX
 * 3.141592653-2.6-1.40.28 (TeX Live 2025)`, `git version 2.49.0.windows.1`, `biber version: 2.21`,
 * `3.24.6, 2025-08-08` - and a regex that extracts "the version" from all of them extracts the
 * wrong thing from several. The tool's own first informative line is more useful and cannot be
 * wrong. latexmk needs the scan because it prints two lines of Windows code-page chatter first.
 */
export function firstInformativeLine(out: string): string | undefined {
	const lines = out
		.split(/\r?\n/)
		.map((l) => l.trim())
		.filter(Boolean);
	// a line carrying something version-shaped beats the first line
	const versionish = lines.find((l) => /\d+\.\d+/.test(l));
	const line = versionish ?? lines[0];
	if (!line) return undefined;
	// `synctex --version` is not a real flag: it prints its usage error and still exits 0. That the
	// program ran at all is the answer; its complaint is not worth showing.
	if (/\berror\b/i.test(line)) return undefined;
	return line.length > 90 ? line.slice(0, 89) + '…' : line;
}

/**
 * Run one probe.
 *
 * Existence is decided by whether the program COULD BE SPAWNED (ENOENT = no), never by its exit
 * code: `synctex --version` exits 0 while printing an error, and several TeX tools exit non-zero
 * for `--version`.
 */
function probeOne(id: string, command: string, args: string[]): Promise<ToolProbe> {
	return new Promise((resolve) => {
		timeSync(`probe ${id}`, () =>
			execFile(command, args, { timeout: 10000, windowsHide: true }, (err, stdout, stderr) => {
				const code = (err as NodeJS.ErrnoException | null)?.code;
				if (code === 'ENOENT') return resolve({ id, found: false, command });
				resolve({ id, found: true, detail: firstInformativeLine(`${stdout}\n${stderr}`), command });
			})
		);
	});
}

// The version flag each tool actually answers to. latexmk wants `-v`, not `--version`; synctex has
// no version flag at all and is probed for existence alone.
const TOOLS: { id: string; command: string; args: string[] }[] = [
	{ id: 'latexmk', command: 'latexmk', args: ['-v'] },
	{ id: 'pdflatex', command: 'pdflatex', args: ['--version'] },
	{ id: 'lualatex', command: 'lualatex', args: ['--version'] },
	{ id: 'xelatex', command: 'xelatex', args: ['--version'] },
	{ id: 'biber', command: 'biber', args: ['--version'] },
	{ id: 'bibtex', command: 'bibtex', args: ['--version'] },
	{ id: 'latexindent', command: 'latexindent', args: ['--version'] },
	{ id: 'synctex', command: 'synctex', args: ['--version'] },
	{ id: 'git', command: 'git', args: ['--version'] }
];

/**
 * Probe every tool at once.
 *
 * In parallel because latexindent is a Perl script that can take a second on its own, and nine
 * sequential probes would make the panel feel broken.
 */
export async function probeToolchain(): Promise<ToolProbe[]> {
	await shellEnvReady();
	return Promise.all(TOOLS.map((t) => probeOne(t.id, t.command, t.args)));
}

/**
 * `base` with `dirs` prepended to PATH, for handing to a child process.
 *
 * WHY THIS EXISTS. The terminal spawns with the app's own environment, so it only ever sees the
 * PATH Texpile itself was launched with. A binary the user pointed at in Preferences is therefore
 * invisible to it: the language server would happily use the configured tinymist (the main process
 * spawns it by absolute path), the Toolchain tab would report it as found, and then pressing
 * Compile would fail with "'tinymist' is not recognized" - the app telling you a tool is installed
 * and then failing to use it.
 *
 * Prepended rather than appended: a path the user configured explicitly should beat a stale copy
 * that happens to be on the system PATH, which is the same order tinymist's own editor plugins use
 * when they resolve a server (configured first, PATH last).
 *
 * Two details that are easy to get wrong on Windows:
 *
 *  - the variable is conventionally `Path` there, not `PATH`, and env lookup is case-INSENSITIVE
 *    while a plain JS object is not. Writing `env.PATH` next to an existing `Path` produces two
 *    keys, and the one the child actually uses is not the one we set. So reuse whichever key is
 *    already present.
 *  - the separator is `;`, not `:`.
 */
export function withPathDirs(base: NodeJS.ProcessEnv, dirs: (string | null | undefined)[]): NodeJS.ProcessEnv {
	const clean = dirs.filter((d): d is string => !!d && d.trim().length > 0);
	if (!clean.length) return { ...base };

	const sep = process.platform === 'win32' ? ';' : ':';
	const env = { ...base };
	// find the existing key whatever its casing, so we extend it rather than shadow it
	const key = Object.keys(env).find((k) => k.toLowerCase() === 'path') ?? 'PATH';
	const current = env[key] ?? '';
	const existing = current.split(sep).filter(Boolean);

	// don't grow PATH on every spawn: a directory already on it keeps its position
	const seen = new Set(existing.map((p) => (process.platform === 'win32' ? p.toLowerCase() : p)));
	const added = clean.filter((d) => !seen.has(process.platform === 'win32' ? d.toLowerCase() : d));
	if (!added.length) return env;

	env[key] = [...added, ...existing].join(sep);
	return env;
}
