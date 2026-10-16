// the macros and environments a parse reads
import { environmentInfo, macroInfo } from '@unified-latex/unified-latex-ctan';
import type * as Ast from '@unified-latex/unified-latex-types';
import type { ParseOptions } from '../types';
import { packageUsesIn } from '../../intellisense/packages/packageUses';
import { KERNEL_MATH, KERNEL_SIGNATURES } from './kernelSignatures';

// the commands the converter reads arguments of, laid out as unified-latex gives them
const CONVERTER_READS = new Set([
	'textbf',
	'textit',
	'emph',
	'underline',
	'texttt',
	'textsuperscript',
	'textsubscript',
	'abstract',
	'verb',
	'textcolor',
	'hl',
	'colorbox',
	'url',
	'href',
	'section',
	'subsection',
	'subsubsection',
	'paragraph',
	'subparagraph',
	'chapter',
	'part',
	'newline',
	'label',
	'rule',
	'cite',
	'ref',
	'eqref',
	'vspace',
	'input',
	'include',
	'includegraphics',
	'item',
	'caption',
	'bibitem',
	'multicolumn'
]);
// listNewcommands reads a definition by how many arguments its definer took
const DEFINER = /^(?:(?:re)?new|provide)(?:command|environment)$|(?:Document|ExpandableDocument)(?:Command|Environment)$/;

function required(signature: string): string {
	return signature
		.split(/\s+/)
		.filter((t) => /^[mrRv]/.test(t))
		.join(' ');
}

function width(signature: string): number {
	return signature.split(/\s+/).filter(Boolean).length;
}

// classes add optional arguments to some kernel commands (\author[orcid]{name}), which unified-latex's wider signature reads
function widensKernel(name: string, entry: Ast.MacroInfo): boolean {
	const ours = KERNEL_SIGNATURES[name]?.signature;
	const theirs = entry.signature;
	return ours != null && theirs != null && required(theirs) === required(ours) && width(theirs) > width(ours);
}

function kept(name: string, entry: Ast.MacroInfo): boolean {
	return (
		CONVERTER_READS.has(name) ||
		DEFINER.test(name) ||
		!!entry.argumentParser ||
		!!entry.renderInfo?.inMathMode ||
		!/^[a-zA-Z]+$/.test(name) ||
		widensKernel(name, entry)
	);
}

// the other unified-latex package entries, for what our kernel lacks: ^ and _ take \mathbb{R} whole only when its
// argument attaches in the same pass
let restTable: Ast.MacroInfoRecord | null = null;
function restMacros(): Ast.MacroInfoRecord {
	if (!restTable) {
		restTable = {};
		for (const [group, macros] of Object.entries(macroInfo))
			if (group !== 'beamer')
				for (const [name, entry] of Object.entries(macros)) if (!(name in KERNEL_SIGNATURES) && !kept(name, entry)) restTable[name] = entry;
	}
	return restTable;
}

// what unified-latex attached in the parse still attaches there, where a list's processing reads it; the kernel's other
// commands attach after the parse, as a usage guess did, and so read past a comment between arguments (\markboth{A}% {B})
const unifiedNames = new Set(
	Object.entries(macroInfo)
		.filter(([group]) => group !== 'beamer')
		.flatMap(([, macros]) => Object.keys(macros))
);
function kernelWhere(test: (name: string) => boolean): Ast.MacroInfoRecord {
	return Object.fromEntries(Object.entries(KERNEL_SIGNATURES).filter(([name]) => test(name)));
}
const KERNEL_IN_PARSE = kernelWhere((name) => unifiedNames.has(name));
/** the kernel's math commands unified-latex lacks, which attach in math only */
export const KERNEL_IN_MATH = kernelWhere((name) => !unifiedNames.has(name) && KERNEL_MATH.has(name));
export const KERNEL_AFTER_PARSE = kernelWhere((name) => !unifiedNames.has(name) && !KERNEL_MATH.has(name));

const keptTables = new Map<boolean, Ast.MacroInfoRecord>();
function keptMacros(beamer: boolean): Ast.MacroInfoRecord {
	let table = keptTables.get(beamer);
	if (!table) {
		table = {};
		for (const [group, macros] of Object.entries(macroInfo)) {
			if (group === 'beamer' && !beamer) continue;
			// beamer's overlay arguments come whole: our package files cannot place one after an argument (\only{x}<2>)
			for (const [name, entry] of Object.entries(macros)) if (group === 'beamer' || kept(name, entry)) table[name] = entry;
		}
		keptTables.set(beamer, table);
	}
	return table;
}

/** the unified-latex entries a parse keeps, which nothing the document defines replaces */
export function keptMacroNames(beamer: boolean): Set<string> {
	return new Set(Object.keys(keptMacros(beamer)));
}

export function macroTable(options: ParseOptions): Ast.MacroInfoRecord {
	const table = { ...KERNEL_IN_PARSE, ...restMacros() };
	for (const [name, entry] of Object.entries(options.documentMacros ?? {})) if (name in table) table[name] = entry;
	return { ...table, ...keptMacros(!!options.beamer), ...options.macros };
}

export function environmentTable(options: ParseOptions): Ast.EnvInfoRecord {
	const groups = Object.entries(environmentInfo).filter(([group]) => group !== 'beamer' || options.beamer);
	return Object.assign({}, ...groups.map(([, envs]) => envs), options.environments);
}

/** the definitions that replace an entry the table reads differently */
export function replacedBy(options: ParseOptions, definitions: { name: string; signature: string }[]): Ast.MacroInfoRecord {
	const table = macroTable(options);
	const kept = { ...keptMacros(!!options.beamer), ...options.macros };
	const replaced: Ast.MacroInfoRecord = {};
	for (const { name, signature } of definitions)
		if (name in table && !(name in kept) && table[name].signature !== signature) replaced[name] ??= { signature };
	return replaced;
}

/** the preamble loads beamer, whose overlay arguments (\item<2>) apply only there */
export function loadsBeamer(preamble: string): boolean {
	return packageUsesIn(preamble).some((use) => use.name === 'class-beamer' || use.name === 'beamerarticle');
}
