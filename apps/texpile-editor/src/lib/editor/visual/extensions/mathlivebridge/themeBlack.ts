// mathlive draws black (and \boxed, hard-coded to it) as #000000 on any theme; the live field and
// the static placeholder both use the text color instead, so they still match
export function themeColorMap(name: string): string | undefined {
	return /^(black|#000(000)?)$/i.test(name) ? 'currentColor' : undefined;
}

export function themeStaticMarkup(markup: string): string {
	return markup.replace(/(solid |[";]color:)#000000/g, '$1currentColor');
}
