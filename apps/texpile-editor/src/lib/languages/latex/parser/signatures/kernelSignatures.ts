// the kernel's argument signatures, from its package file
import type * as Ast from '@unified-latex/unified-latex-types';
import kernel from '../../intellisense/data/packages/latex-document.json';
import { ACCENTS, SYMBOLS } from '../../texCharacters';
import { ignoredMacros } from '../macros';
import { signaturesOf } from './formatSignature';

// an accent's letter and a symbol word's space stay text beside the chip; a dropped command must not take what follows
export const KERNEL_SIGNATURES: Ast.MacroInfoRecord = Object.fromEntries(
	[...signaturesOf(kernel.macros)]
		.filter(([name]) => !(name in ACCENTS) && !(name in SYMBOLS) && !ignoredMacros.has(name))
		.map(([name, signature]) => [name, { signature }])
);

/** the kernel's math commands, which the parse attaches so ^ and _ take \mathrm{max} whole */
export const KERNEL_MATH = new Set(kernel.macros.filter((m) => 'math' in m && m.math).map((m) => m.name));
