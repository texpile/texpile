import type { LibraryElement } from '$lib/draw/editor/figure/figureLanguage';

/** `libraries`: the cetz modules it needs imported beside `canvas` and `draw`; `usepackage`: another package's import line */
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
