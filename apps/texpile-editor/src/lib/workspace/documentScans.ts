import { scanMacroDefinitions, scanRegisterDefinitions, type MacroDef } from '$lib/editor/source/extensions/math-preview/macroScan';
import { scanGlossary, type GlossEntry } from '$lib/languages/latex/intellisense/completion/glossaryScan';
import { citeAliasesIn } from '$lib/languages/latex/visual/core/definitions/citeAliases';

/** what the whole file defines, read in the parse's worker: each scan reads a tree of the file of its own */
export type DocumentScans = {
	macros: Record<string, MacroDef>;
	registers: string[];
	glossary: GlossEntry[];
	citeAliases: Record<string, string>;
};

export const NO_SCANS: DocumentScans = { macros: {}, registers: [], glossary: [], citeAliases: {} };

export function scanDocument(source: string): DocumentScans {
	return {
		macros: scanMacroDefinitions(source),
		registers: scanRegisterDefinitions(source),
		glossary: scanGlossary(source, []),
		citeAliases: citeAliasesIn(source)
	};
}
