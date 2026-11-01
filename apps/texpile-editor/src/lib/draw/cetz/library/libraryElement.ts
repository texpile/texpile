import type { LibraryElement } from '$lib/draw/editor/figure/figureLanguage';

/** `libraries`: cetz modules imported beside `canvas` and `draw`; `usepackage`: another package's import */
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
