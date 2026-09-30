import { toaster } from '$lib/modals/toaster-svelte';
import { tinymistInstaller } from '$lib/modals/window/tinymistInstall.svelte';
import { installTinymistWithToast } from '$lib/modals/window/tinymistInstallToast';
import { openToolchainPrefs } from '$lib/stores/dialogStore';
import { workspaceRoot } from './workspaceStore';
import { resolveOutputPath } from './compileCommand';
import { typstLogArg } from './typstCommand';
import { m } from '$lib/paraglide/messages';
// "The compile run needed a program that isn't installed" - read out of what the shell printed.
// Pure: no DOM, no IPC, unit-testable.
//
// This asks the output WHICH program was missing, rather than asking whether one particular
// program was. Matching against the command's first word (what this used to do) got both ends
// wrong: `latexmk -lualatex` with lualatex missing says `bash: lualatex: command not found`, which
// names the engine and not latexmk, so nothing was reported at all; and `make` reporting its own
// child as `make: pdflatex: Command not found` matched the first word and blamed make, which is
// installed. Reading the name out of the line answers both correctly.
//
// The cost is that the program named may be a helper rather than the compiler - a missing biber or
// gs now gets reported. That is still the thing the user has to install.

/**
 * What each shell says, and where in the line the name sits.
 *
 *   zsh        zsh: command not found: latexmk
 *   bash/ksh   bash: line 1: latexmk: command not found
 *   make       make: pdflatex: Command not found          (a wrapper naming its child)
 *   dash/sh    sh: 1: latexmk: not found
 *   cmd.exe    'latexmk' is not recognized as an internal or external command,
 *   PowerShell The term 'latexmk' is not recognized as a name of a cmdlet...
 *
 * Order matters: zsh puts the name AFTER the phrase, so its pattern has to be tried before the
 * bash one, which would otherwise read zsh's own prefix ("zsh: command not found") as the name.
 */
const NOT_FOUND_PATTERNS: RegExp[] = [
	/command not found:\s*(\S+)/i,
	/(?:^|[\s:])([^\s:]+):\s*command not found/i,
	// dash/sh, the loose one: "not found" without the word "command". Anchored to a shell's own
	// prefix (sh, bash, dash, zsh, /bin/sh, all of which end in "sh") and its optional line number,
	// because `X: not found` on its own is a shape ordinary log text hits - "entering extended
	// mode: not found by the user" reported `mode` before this was pinned down.
	/^\s*\S*sh(?:\.exe)?:\s*(?:\d+:\s*)?([^\s:]+):\s*not found\b/i,
	/'([^']+)' is not recognized as an internal/i,
	/The term '([^']+)' is not recognized/i
];

/** a reported name as the user knows it: no quotes, no directory, no .exe */
function cleanName(raw: string): string {
	const unquoted = raw.replace(/^["']|["']$/g, '');
	return (unquoted.split(/[/\\]/).pop() ?? unquoted).replace(/\.exe$/i, '');
}

/**
 * The program the shell reported missing in `output`, or null when nothing was.
 *
 * First hit wins: a run that is missing two programs only ever gets as far as the first anyway.
 */
export function missingProgram(output: string): string | null {
	if (!output) return null;
	for (const line of output.split(/\r?\n/)) {
		for (const re of NOT_FOUND_PATTERNS) {
			const name = re.exec(line)?.[1];
			if (name) {
				const clean = cleanName(name);
				if (clean) return clean;
			}
		}
	}
	return null;
}

/**
 * Does this command send stderr somewhere other than the terminal?
 *
 * It matters because the shell writes its own "command not found" to the failed command's stderr,
 * which the redirect has already applied - so for a command like the Typst default
 * (`tinymist compile ... 2>out/x.log`) the evidence lands in the log file and never reaches the
 * captured output. Verified against both bash and cmd.exe.
 */
export function redirectsStderr(cmd: string): boolean {
	return /(?:^|\s)(?:2>|&>|>&)/.test(cmd);
}

/**
 * The command named a program the shell could not find: say so, and offer the panel that lists
 * what IS installed.
 *
 * Worth its own toast because this failure produces no diagnostics to show. No log is written,
 * no PDF appears, and the Problems panel stays empty - the only evidence is one line of shell
 * text in a terminal the reader may not have open, phrased by the shell rather than by us
 * ("'latexmk' is not recognized as an internal or external command"), which says nothing about
 * what to do next.
 *
 * Only on the marker-tracked path, because that is the only one that captures output at all
 * (see runCompile). With the completion marker off, this failure stays as silent as it was.
 */
export async function reportMissingTool(opts: {
	cmd: string;
	stdout: string;
	baseDir: string | null;
	logPath: string | null;
	readText(path: string): Promise<string>;
}): Promise<boolean> {
	const { cmd } = opts;
	let program = missingProgram(opts.stdout);
	// a command that redirects stderr (the Typst default does) leaves the shell's own error in
	// the log rather than the terminal. Only read it in that case: a LaTeX log can be megabytes,
	// and without a redirect it cannot hold the line anyway.
	//
	// Read the `2>` target parsed from the command itself, not the lane-derived logPath: lane
	// detection keys off the binary name, so the exact failure this reports (`tinymiast`, a
	// misspelled tinymist) also breaks the lane's idea of where the log is - the evidence sat
	// in the redirect file while the pipeline read a path that was never written. The lane
	// path stays as the fallback for redirect shapes the parser does not model (&>, >&).
	if (!program && redirectsStderr(cmd)) {
		const base = opts.baseDir ?? workspaceRoot.current;
		const target = typstLogArg(cmd); // generic 2>/2>> parsing despite the home module
		const stderrPath = target && base ? resolveOutputPath(base, target) : opts.logPath;
		if (stderrPath) {
			try {
				program = missingProgram(await opts.readText(stderrPath));
			} catch {
				/* no log to read: nothing more to say */
			}
		}
	}
	if (!program) return false;
	await toastMissingTool(program);
	return true;
}

/**
 * "`program` is not installed", with the one next step there is: the panel listing what IS
 * installed, or for tinymist, which Texpile can fetch itself, the install.
 */
export async function toastMissingTool(program: string): Promise<void> {
	if (program === 'tinymist' && tinymistInstaller.available) await tinymistInstaller.refresh();
	const installable = program === 'tinymist' && tinymistInstaller.offered;
	toaster.error({
		title: m.compile_tool_missing_title(),
		description: m.compile_tool_missing({ tool: program }),
		duration: installable ? 12000 : 8000,
		action: installable
			? { label: m.tinymist_install(), onClick: () => void installTinymistWithToast() }
			: { label: m.compile_tool_missing_action(), onClick: openToolchainPrefs }
	});
}
