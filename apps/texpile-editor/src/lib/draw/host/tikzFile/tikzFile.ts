/** a figure file, `\input` into a paper: Visual is its picture in the figure editor, Source its text */
export function isTikzFile(path: string | null): boolean {
	return !!path && /\.tikz$/i.test(path);
}
