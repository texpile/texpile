// \includegraphics lets the extension be omitted AND searches several directories (the file's own,
// the project root, every \graphicspath entry). Resolving against one directory with one name
// showed not-found for figures that exist, so this probes the grid the engine would: each
// candidate name, in each candidate directory. The engine's own order decides: pdflatex tries .pdf first.

export type ResolvedGraphic = {
	url: string;
	isPdf: boolean;
};

export async function resolveGraphicUrl(
	src: string,
	/** every URL this relative path could resolve to, in search order */
	urlsFor: (rel: string) => string[],
	exists: (url: string) => Promise<boolean>,
	/** what the engine tries on a name without one, dotted, in its order */
	extensions: string[]
): Promise<ResolvedGraphic> {
	if (/\.[a-z0-9]+$/i.test(src)) {
		const isPdf = /\.pdf$/i.test(src);
		const urls = urlsFor(src);
		// only one place it could be: trust it rather than spending a request to confirm what the
		// <img> error path would report anyway
		if (urls.length <= 1) return { url: urls[0] ?? '', isPdf };
		for (const url of urls) if (await exists(url)) return { url, isPdf };
		return { url: urls[0], isPdf };
	}

	// extension outer, directory inner: a .pdf in ANY search directory beats a .png, which is the
	// order the engine resolves in
	for (const ext of extensions) {
		for (const url of urlsFor(src + ext)) {
			if (await exists(url)) return { url, isPdf: ext.toLowerCase() === '.pdf' };
		}
	}
	// nothing found: hand back the first candidate and let the <img> error path show not-found
	return { url: urlsFor(src)[0] ?? '', isPdf: false };
}
