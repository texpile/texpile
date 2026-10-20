import { m } from '$lib/paraglide/messages';
import { getLocale } from '$lib/paraglide/runtime';
import type { LatexCheck, SourceProblem } from '../latexChecks';
import { writtenUses } from '../reading/openFileUses';

const ENGINE_NAMES: Record<string, string> = { pdflatex: 'pdfLaTeX', lualatex: 'LuaLaTeX', xelatex: 'XeLaTeX' };

export const engineCheck: LatexCheck = {
	id: 'engine',
	run(input) {
		const engine = input.engine;
		if (!engine) return [];
		const problems: SourceProblem[] = [];
		for (const { use, label } of writtenUses(input)) {
			const engines = input.loaded
				.find((f) => f.name === use.name)
				?.layers.reduce<string[] | undefined>((e, l) => l.engines ?? e, undefined);
			if (!engines || engines.includes(engine)) continue;
			problems.push({
				rule: 'engine',
				at: use.at,
				anchor: label,
				message: m.latex_check_engine_unsupported({
					name: label,
					engines: new Intl.ListFormat(getLocale(), { type: 'disjunction' }).format(engines.map((e) => ENGINE_NAMES[e] ?? e))
				})
			});
		}
		return problems;
	}
};
