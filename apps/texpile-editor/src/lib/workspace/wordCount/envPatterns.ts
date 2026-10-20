import { commonEnvNames, envNameAlternation, holdsMath } from '$lib/languages/latex/knowledge/environments/envFacts';

const NEVER = /(?!)/g;
let tables: RegExp | null = null;
let bibliographies: RegExp | null = null;

/** an alignment environment holding text (tabular, longtable), whole, its name in group 1 */
export function tableEnvPattern(): RegExp {
	if (!tables) {
		const names = commonEnvNames((f) => !!f.cells && !holdsMath(f));
		tables = names.length ? new RegExp(`\\\\begin\\{(${envNameAlternation(names)})\\}[\\s\\S]*?\\\\end\\{\\1\\}`, 'g') : NEVER;
	}
	return tables;
}

/** the reference list, which also runs to the end of the text when unclosed */
export function bibliographyPattern(): RegExp {
	if (!bibliographies) {
		const names = commonEnvNames((f) => !!f.item?.includes('bibitem'));
		bibliographies = names.length
			? new RegExp(`\\\\begin\\{(?:${envNameAlternation(names)})\\}[\\s\\S]*?(?:\\\\end\\{(?:${envNameAlternation(names)})\\}|$)`, 'g')
			: NEVER;
	}
	return bibliographies;
}
