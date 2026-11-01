import type { LibraryElement } from '$lib/draw/editor/figure/figureLanguage';

export function element(
	group: string,
	id: string,
	name: string,
	text: string,
	libraries: string[] = [],
	usepackage: string | null = null
): LibraryElement {
	return { group, id, name, text, libraries, usepackage, thumb: new URL(`./thumbs/${id}.svg`, import.meta.url).href };
}
