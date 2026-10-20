import { isBundled } from '$lib/languages/latex/knowledge/bundledFiles';
import { fileIdOf } from '$lib/languages/latex/knowledge/fileIds';
import { packageUsesIn } from '$lib/languages/latex/intellisense/packages/packageUses';
import { userLayers } from '$lib/languages/latex/knowledge/userFiles';

/** the packages a document loads that Texpile has no data for and no package file covers yet */
export function packagesWithoutData(text: string): string[] {
	const names = packageUsesIn(text)
		.filter((u) => u.file?.endsWith('.sty'))
		.map((u) => u.name);
	return [...new Set(names)].filter((n) => !isBundled(fileIdOf(n)) && !userLayers(n).length);
}
