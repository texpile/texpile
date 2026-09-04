// Every showcase asset's built URL, keyed by its path from the landing root. A figure in a
// markdown file points at the file relative to itself; the renderer turns that into this key.
const ASSETS = import.meta.glob('/src/lib/assets/showcase/**/*.{png,webp,mp4,webm}', {
	query: '?url',
	import: 'default',
	eager: true
}) as Record<string, string>;

export function assetUrl(path: string): string {
	const url = ASSETS[path];
	if (!url) throw new Error(`no asset at ${path}`);
	return url;
}
