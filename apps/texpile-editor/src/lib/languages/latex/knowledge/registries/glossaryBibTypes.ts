import { layersOf } from '../loadedFiles';

/** the bib2gls entry types whose keys \gls takes */
export async function glossaryBibTypes(): Promise<Set<string>> {
	const layers = await layersOf('glossaries-extra-bib2gls');
	return new Set(layers.flatMap((l) => l.provides?.bibTypes ?? []).flatMap((t) => (t.hidden ? [] : [t.name])));
}
