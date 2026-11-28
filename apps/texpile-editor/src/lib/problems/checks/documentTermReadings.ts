// how the packages the document loads read acronym and glossary commands (acro's \DeclareAcronym is in none of the common readings)
import { loadedPackages } from '$lib/languages/latex/intellisense/packages/loadedPackages';
import { loadedReadings } from '$lib/languages/latex/knowledge/calls/loadedReadings';
import type { CommandReadings } from '$lib/languages/latex/knowledge/calls/commandCalls';
import { plainUses, readingOf, usesInReadingOrder } from '$lib/workspace/document/readingOrder';

export const TERM_ROLES = ['glossary', 'acronym'] as const;

/** files: the main file first; null when the packages could not be read */
export async function documentTermReadings(files: readonly { path: string; text: string }[]): Promise<CommandReadings | null> {
	const uses = plainUses(usesInReadingOrder(files.map((f) => readingOf(f.path, f.text))));
	const loaded = await loadedPackages(uses).catch(() => null);
	return loaded && loadedReadings(loaded, [...TERM_ROLES]);
}
