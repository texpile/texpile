export function isTikzFile(path: string | null): boolean {
	return !!path && /\.tikz$/i.test(path);
}
