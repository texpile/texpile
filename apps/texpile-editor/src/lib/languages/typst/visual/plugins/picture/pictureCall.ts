// a chip that is one call of a package function that draws a picture
import { packageSpecOf } from '$lib/languages/typst/knowledge';
import { withoutTrailingLabel, typstScopeOfDrawing, readPackageUse } from '$lib/languages/typst/visual/core/document';

export function readPicture(source: string): { package: string; name: string } | null {
	const written = source.trim();
	const use = readPackageUse(withoutTrailingLabel(written.startsWith('#') ? written : `#${written}`), typstScopeOfDrawing(written));
	if (!use?.call || !use.found.entry.picture) return null;
	return { package: packageSpecOf(use.found.origin)?.name ?? use.found.origin, name: use.name };
}
