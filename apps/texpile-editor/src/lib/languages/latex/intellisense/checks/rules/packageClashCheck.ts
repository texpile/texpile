import { m } from '$lib/paraglide/messages';
import { useNameOf } from '../../../knowledge/fileIds';
import type { LatexCheck, LatexCheckInput, SourceProblem } from '../latexChecks';
import { movePackageAbove } from '../../packages/packageMove';
import { loadClosures } from '../reading/loadClosures';
import { writtenUses } from '../reading/openFileUses';

function clashesOf(input: LatexCheckInput, name: string): Set<string> {
	const layers = input.loaded.find((f) => f.name === name)?.layers ?? [];
	return new Set(layers.reduce<string[] | undefined>((c, l) => l.clashes ?? c, undefined)?.map(useNameOf));
}

export const packageClashCheck: LatexCheck = {
	id: 'package-clash',
	run(input) {
		const closures = loadClosures(input.loaded, input.engine);
		const written = new Set(writtenUses(input).map(({ use }) => use));
		const position = new Map(input.loaded.map((f, i) => [f.name, i]));
		// which use first brought each file in; the kernel and the default class come before them all
		const firstLoad = new Map<string, number>();
		const used = new Set(input.uses.flatMap((u) => [...(closures.get(u.name) ?? [])]));
		for (const f of input.loaded) if (!used.has(f.name)) for (const n of closures.get(f.name) ?? []) firstLoad.set(n, -1);
		const firstUses = new Set<string>();
		const problems: SourceProblem[] = [];
		const before: string[] = [];
		input.uses.forEach((use, turn) => {
			const closure = closures.get(use.name);
			if (!closure) return;
			for (const n of closure) if (!firstLoad.has(n)) firstLoad.set(n, turn);
			if (written.has(use) && !firstUses.has(use.name)) {
				const clashes = clashesOf(input, use.name);
				// a clash that comes from a dependency loaded before this use is that dependency's to report
				const inherited = [...closure].filter((n) => n !== use.name && (firstLoad.get(n) ?? turn) < turn);
				const earlier = input.loaded
					.slice(0, position.get(use.name))
					.find((f) => clashes.has(f.name) && !inherited.some((d) => clashesOf(input, d).has(f.name)));
				if (earlier) {
					// the package the document wrote, itself or the one that loads it
					const named = before.includes(earlier.name)
						? earlier.name
						: (before.find((n) => closures.get(n)?.has(earlier.name)) ?? earlier.name);
					const label = use.name.replace(/^class-/, '');
					problems.push({
						rule: 'package-clash',
						at: use.at,
						anchor: label,
						message: m.latex_check_package_clash_order({ name: label, earlier: named.replace(/^class-/, '') }),
						...(movePackageAbove(input.text, use.name, named)
							? { fix: { kind: 'move-package' as const, first: use.name, second: named } }
							: {})
					});
				}
			}
			firstUses.add(use.name);
			before.push(use.name);
		});
		return problems;
	}
};
