import { layersOf } from '../loadedFiles';

/** the names listings takes for language= as they stand; a language that needs a dialect (Assembler) is left out */
export async function listingsLanguages(): Promise<string[]> {
	const layers = await layersOf('listings');
	return layers.flatMap((l) => l.keys?.['packages/listings#language'] ?? []).flatMap((k) => (k.key.startsWith('[') ? [] : [k.key]));
}
