// a chip that is one call of a package function that draws a picture
import { packageSpecOf } from '$lib/languages/typst/knowledge';
import { withoutTrailingLabel, typstScopeOfDrawing, readPackageUse } from '$lib/languages/typst/visual/core/document';

/** the package and the function of a chip that is one call drawing a picture */
export function readPicture(source: string): { package: string; name: string } | null {
	const written = source.trim();
	// a call lifted out of a code block is written without its hash
	const use = readPackageUse(withoutTrailingLabel(written.startsWith('#') ? written : `#${written}`), typstScopeOfDrawing(written));
	if (!use?.call || !use.found.entry.picture) return null;
	return { package: packageSpecOf(use.found.origin)?.name ?? use.found.origin, name: use.name };
}
