// The package a LaTeX symbol needs. The picker never rewrites a preamble on its own: a package can
// clash with one already loaded (wasysym's \iint with amsmath's), so the \usepackage is offered
// once the symbol is in, and written only when taken.
import { box } from '$lib/runes/box.svelte';
import { toaster } from '$lib/modals/toaster-svelte';
import { detectedPackages } from '$lib/languages/latex/intellisense/completion/packageData';
import { m } from '$lib/paraglide/messages';
import type { LatexSymbol } from './latexSymbol.types';

// textcomp's symbols have been in the kernel since LaTeX 2020-02-01
const KERNEL_PACKAGES = new Set(['textcomp']);
// packages that load another the table names: mathtools brings amsmath, amssymb amsfonts
const LOADED_BY: Readonly<Record<string, readonly string[]>> = { amsmath: ['mathtools'], amsfonts: ['amssymb'] };

const DOCUMENT_CLASS = /^[^%\n]*\\documentclass\s*(?:\[[^\]]*\])?\s*\{[^}]*\}/m;
const USE_PACKAGE = /^[^%\n]*\\(?:usepackage|RequirePackage)\s*(?:\[[^\]]*\])?\s*\{[^}]*\}/gm;
const BEGIN_DOCUMENT = /\\begin\s*\{document\}/;
const T1_FONTENC = /\\usepackage\s*\[[^\]]*\bT1\b[^\]]*\]\s*\{fontenc\}/;
// `\%` is a percent sign, `\\%` a line break and then a comment
const COMMENT = /(?<!\\)((?:\\\\)*)%.*/g;

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
export function usepackageFor(symbol: Pick<LatexSymbol, 'package' | 'fontenc'>): string | null {
	if (symbol.fontenc) return `\\usepackage[${symbol.fontenc}]{fontenc}`;
	if (symbol.package && !KERNEL_PACKAGES.has(symbol.package)) return `\\usepackage{${symbol.package}}`;
	return null;
}

/** true when `text` loads what `symbol` needs, itself or through a package that loads it */
export function loadsPackageFor(text: string, symbol: Pick<LatexSymbol, 'package' | 'fontenc'>): boolean {
	const code = text.replace(COMMENT, '$1');
	if (symbol.fontenc === 'T1') return T1_FONTENC.test(code);
	if (!usepackageFor(symbol)) return true;
	const loaded = detectedPackages(code);
	return loaded.has(symbol.package) || (LOADED_BY[symbol.package] ?? []).some((p) => loaded.has(p));
}

/** true when the file starts a document of its own, so its preamble is the one that counts */
export function hasPreamble(text: string): boolean {
	return DOCUMENT_CLASS.test(text);
}

/** `text` with `line` on a line of its own after the preamble's last \usepackage, or after \documentclass */
export function withUsepackage(text: string, line: string): string {
	const begin = BEGIN_DOCUMENT.exec(text)?.index ?? text.length;
	const preamble = text.slice(0, begin);
	const anchor = [...preamble.matchAll(USE_PACKAGE)].at(-1) ?? DOCUMENT_CLASS.exec(preamble);
	if (!anchor) return text;
	const end = anchor.index + anchor[0].length;
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
	if (!file || !line || !text || !hasPreamble(text) || loadsPackageFor(text, symbol)) return;
	// the toast outlives a switch to another file, which the editor then holds
	const path = file.path();
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
				if (now && !loadsPackageFor(now, symbol)) void file.edit(now, withUsepackage(now, line));
			}
		}
	});
}
