// The package a LaTeX symbol needs. The picker never rewrites a preamble on its own: a package can
// clash with one already loaded (wasysym's \iint with amsmath's), so the \usepackage is offered
// once the symbol is in, and written only when taken.
import { box } from '$lib/runes/box.svelte';
import { toaster } from '$lib/modals/toaster-svelte';
import { filePackageNames } from '$lib/languages/latex/intellisense/packages/loadedPackages';
import { loaderCalls } from '$lib/languages/latex/intellisense/packages/loaderCommands';
import { kernelDefines } from '$lib/languages/latex/knowledge/commands/kernelCommands';
import { packageDefining } from '$lib/languages/latex/knowledge/commands/packageFor';
import { blankComments, packageUsesIn } from '$lib/languages/latex/intellisense/packages/packageUses';
import { m } from '$lib/paraglide/messages';
import type { LatexSymbol } from './latexSymbol.types';

const DOCUMENT_START = 'documentclass';
const BEGIN_DOCUMENT = /\\begin\s*\{document\}/;

function documentStart(text: string) {
	return loaderCalls(blankComments(text), ['class']).find((call) => call.command === DOCUMENT_START);
}

/** the open .tex file as a whole, preamble and all, whichever editor shows it */
export type OpenTexFile = {
	/** where it is saved, or null when it is not */
	path(): string | null;
	/** its text, or null when the open file is not LaTeX */
	text(): string | null;
	/** replace `before` with `next` as one undoable edit; false when the editor no longer holds `before` */
	edit(before: string, next: string): Promise<boolean>;
};

export const openTexFile = box<OpenTexFile | null>(null);

/** the line that loads what `symbol` needs, or null when the kernel has it */
export function usepackageFor(symbol: Pick<LatexSymbol, 'command' | 'package' | 'fontenc'>): string | null {
	if (symbol.fontenc) return `\\usepackage[${symbol.fontenc}]{fontenc}`;
	if (symbol.package && !kernelDefines(symbol.command)) return `\\usepackage{${symbol.package}}`;
	return null;
}

/** true when `text` loads what `symbol` needs; `packages` is what it loads, as filePackageNames gives them */
export function loadsPackageFor(
	text: string,
	symbol: Pick<LatexSymbol, 'command' | 'package' | 'fontenc'>,
	packages: ReadonlySet<string>
): boolean {
	if (symbol.fontenc === 'T1') return packageUsesIn(text).some((use) => use.name === 'fontenc' && use.options.includes('T1'));
	return !usepackageFor(symbol) || packages.has(symbol.package);
}

/** true when the file starts a document of its own, so its preamble is the one that counts */
export function hasPreamble(text: string): boolean {
	return !!documentStart(text);
}

/** `text` with `line` on a line of its own after the preamble's last \usepackage, or after \documentclass */
export function withUsepackage(text: string, line: string): string {
	const begin = BEGIN_DOCUMENT.exec(text)?.index ?? text.length;
	const preamble = text.slice(0, begin);
	const anchor = loaderCalls(blankComments(preamble), ['package']).at(-1) ?? documentStart(preamble);
	if (!anchor) return text;
	const end = anchor.end;
	const eol = text.indexOf('\n', end);
	const lineEnd = eol === -1 ? text.length : eol;
	const at = Math.min(lineEnd, begin);
	return `${text.slice(0, at)}\n${line}${at < lineEnd ? '\n' : ''}${text.slice(at)}`;
}

/** after `symbol` (or a pasted command) goes in: offer its \usepackage when the open file has a preamble that lacks it */
export function offerPackageFor(symbol: Pick<LatexSymbol, 'command' | 'package' | 'fontenc'>): void {
	const file = openTexFile.current;
	const line = usepackageFor(symbol);
	const text = file?.text();
	if (!file || !line || !text || !hasPreamble(text)) return;
	// the toast outlives a switch to another file, which the editor then holds
	const path = file.path();
	void filePackageNames(text).then((packages) => {
		if (file.path() === path && !loadsPackageFor(text, symbol, packages)) offerLine(file, path, line, symbol);
	});
}

/** after a command (no backslash) goes in: offer the \usepackage of the package that defines it */
export function offerPackageForCommand(name: string): void {
	const pkg = packageDefining('command', name);
	if (pkg) offerPackageFor({ command: `\\${name}`, package: pkg, fontenc: '' });
}

function offerLine(
	file: OpenTexFile,
	path: string | null,
	line: string,
	symbol: Pick<LatexSymbol, 'command' | 'package' | 'fontenc'>
): void {
	toaster.info({
		// one offer per package, however many of its symbols go in while it shows
		id: `latex-package:${line}`,
		title: m.latex_symbols_needs_title({ command: symbol.command }),
		description: line,
		duration: 10000,
		action: {
			label: m.latex_symbols_add_package(),
			onClick: () => {
				const now = file.path() === path ? file.text() : null;
				if (now)
					void filePackageNames(now).then(
						(packages) => file.path() === path && !loadsPackageFor(now, symbol, packages) && file.edit(now, withUsepackage(now, line))
					);
			}
		}
	});
}
