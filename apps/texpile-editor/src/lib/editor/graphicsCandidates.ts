// \includegraphics hover preview: the candidate URLs a relative graphic could resolve to.
// LaTeX searches the current directory, the project root, and every \graphicspath entry, and lets
// the extension be omitted; we mirror that and hand the tooltip the whole list so its <img> can
// advance past the misses rather than us having to stat each one.
import { joinPath, dirname } from '$lib/workspace/fileSystem';

const RASTER_EXTENSIONS = ['.png', '.jpg', '.jpeg', '.webp', '.gif'];
const GRAPHICSPATH_RE = /\\graphicspath\s*\{((?:\s*\{[^{}]*\}\s*)+)\}/;

export function graphicCandidateUrls(
	rel: string,
	opts: { root: string | null; loadedPath: string | null; source: string; fileUrl: (p: string) => string }
): string[] {
	const base = opts.loadedPath ? dirname(opts.loadedPath) : null;
	const cand = rel.replace(/\\/g, '/');
	const names = /\.[a-z]+$/i.test(cand) ? [cand] : RASTER_EXTENSIONS.map((e) => cand + e);

	const dirs: (string | null)[] = [base, opts.root];
	const gp = opts.source.match(GRAPHICSPATH_RE);
	if (gp) {
		for (const d of gp[1].matchAll(/\{([^{}]*)\}/g)) {
			if (!d[1]) continue;
			for (const parent of [base, opts.root]) if (parent) dirs.push(joinPath(parent, d[1]));
		}
	}

	const urls: string[] = [];
	for (const dir of dirs) if (dir) for (const n of names) urls.push(opts.fileUrl(joinPath(dir, n)));
	return [...new Set(urls)];
}
