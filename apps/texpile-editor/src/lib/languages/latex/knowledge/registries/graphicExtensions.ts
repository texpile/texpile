import type { Engine } from '$lib/workspace/compileCommand';
import { commonRegistry } from './registries';

/** the extensions graphicx tries on a name without one, dotted, in the engine's order (pdflatex's when the command names none) */
export function graphicExtensionsFor(engine: Engine | null): string[] {
	const reading = engine ?? 'pdflatex';
	return [
		...new Set(
			commonRegistry('graphicExtensions')
				.filter((g) => g.engine === reading)
				.flatMap((g) => g.ext)
		)
	];
}
