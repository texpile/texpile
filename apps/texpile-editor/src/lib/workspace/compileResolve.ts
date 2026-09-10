// which command a compile runs: the folder's adopted command per lane, else the lane's stock
// default, with the batch flags a terminal run needs
import { DEFAULT_COMPILE_COMMAND } from '$lib/settings';
import { compileConfig } from './projectConfigSync.svelte';
import { effectiveCompileFormat } from './workspaceStore';
import { buildTypstCommand } from './typstCommand';

// a root-relative, forward-slashed path (the form file references take in LaTeX)
export function relFromRoot(p: string, root: string) {
	return p
		.slice(root.length)
		.replace(/^[\\/]+/, '')
		.replace(/\\/g, '/');
}

/**
 * The command this folder compiles with. The main file's extension decides the lane (latex or
 * typst - see effectiveCompileFormat), and each lane resolves independently: the ADOPTED command
 * from .texpile/config.json first (compileConfig - the file's command after the trust gate), else
 * that lane's stock default. Both lanes are kept, so a project holding a .tex and a .typ keeps
 * both commands and changing the main file changes which one runs.
 */
export function resolveFormatCommand(format: 'latex' | 'typst', main?: string | null) {
	const adopted = compileConfig.current[format].command;
	if (adopted) return adopted;
	return format === 'typst' ? buildTypstCommand(main ?? null) : DEFAULT_COMPILE_COMMAND;
}

export function resolveCompileCommand(main?: string | null) {
	return resolveFormatCommand(effectiveCompileFormat(main ?? null), main);
}

// a TeX engine at its default errorstop interaction parks at the interactive ? prompt on the
// first error. for known engine commands, inject -interaction=nonstopmode (plus -file-line-error
// for exact error attribution); custom scripts/makefiles are left untouched.
export function withBatchFlags(cmd: string): string {
	const hit = cmd.match(/^(\s*(?:latexmk|pdflatex|xelatex|lualatex)(?:\.exe)?)(?=\s|$)/i);
	if (!hit) return cmd;
	const flags: string[] = [];
	if (!/-interaction[= ]/.test(cmd)) flags.push('-interaction=nonstopmode');
	if (!/-file-line-error\b/.test(cmd)) flags.push('-file-line-error');
	return flags.length > 0 ? cmd.replace(hit[1], `${hit[1]} ${flags.join(' ')}`) : cmd;
}

const LATEXMK = /^(\s*latexmk(?:\.exe)?)(?=\s|$)/i;

export function isLatexmkCommand(cmd: string): boolean {
	return LATEXMK.test(cmd);
}

/** latexmk -gg: delete its own products, then run every rule regardless of timestamps */
export function withFullRebuild(cmd: string): string {
	return cmd.replace(LATEXMK, '$1 -gg');
}

/** latexmk -c: delete the aux, log, fls and fdb files it made, keep the PDF, run nothing */
export function withCleanAux(cmd: string): string {
	return cmd.replace(LATEXMK, '$1 -c');
}

/** expand {main} to the target file's root-relative path, quoted when it holds spaces */
export function expandMain(cmd: string, root: string | null, target: string | null): string {
	const rel = root && target ? relFromRoot(target, root) : '';
	// quote a path containing spaces so the shell keeps it one argument;
	// a {main} the user already wrapped in quotes stays untouched
	const quoted = /\s/.test(rel) ? `"${rel}"` : rel;
	// function replacements so a path containing $&, $1, $` etc. is inserted literally, not as a
	// replacement-pattern reference
	return cmd.replace(/(["']){main}\1/g, (_m, q: string) => `${q}${rel}${q}`).replaceAll('{main}', () => quoted);
}
