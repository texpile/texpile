// the macros formulas are typeset with: the document's own over the project's
import { projectIntelStore } from '$lib/stores/projectIntel';
import { scanMacroDefinitions, withoutLoops, type MacroDef } from './macroScan';

export type { MacroDef };

let cache: { text: string; intel: unknown; macros: Record<string, MacroDef> } | null = null;

/** buffer definitions merged over cross-file ones (buffer wins), cached per doc text; `scanned`: what scanMacroDefinitions reads in it */
export function mathMacrosFor(docText: string, scanned?: Record<string, MacroDef>): Record<string, MacroDef> {
	const intel = projectIntelStore.current;
	if (cache && cache.text === docText && cache.intel === intel) return cache.macros;
	const macros: Record<string, MacroDef> = {};
	for (const m of intel.macros) {
		if (m.definition !== undefined) macros[m.name] = { def: m.definition, args: m.argCount ?? 0, optional: m.optional };
	}
	const usable = withoutLoops(Object.assign(macros, scanned ?? scanMacroDefinitions(docText)));
	cache = { text: docText, intel, macros: usable };
	return usable;
}
