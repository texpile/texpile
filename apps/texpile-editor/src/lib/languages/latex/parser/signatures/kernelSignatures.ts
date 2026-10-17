// the kernel's argument signatures, from its package file and article's
import type * as Ast from '@unified-latex/unified-latex-types';
import { KERNEL_FILES } from '../../knowledge/bundledFiles';
import { ACCENTS, SYMBOLS } from '../../texCharacters';
import { ignoredMacros } from '../macros';
import { signaturesOf } from './argSignature';

// article's own entries come first: they win over the kernel's
const macros = [...KERNEL_FILES].reverse().flatMap((f) => f.macros ?? []);

// an accent's letter and a symbol word's space stay text beside the chip; a dropped command must not take what follows
export const KERNEL_SIGNATURES: Ast.MacroInfoRecord = Object.fromEntries(
	[...signaturesOf(macros)]
		.filter(([name]) => !(name in ACCENTS) && !(name in SYMBOLS) && !ignoredMacros.has(name))
		.map(([name, signature]) => [name, { signature }])
);

/** the kernel's math commands, which the parse attaches so ^ and _ take \mathrm{max} whole */
export const KERNEL_MATH = new Set(macros.filter((m) => m.in === 'math').map((m) => m.name));
