// Where LaTeX looks for a relative graphic: the including file's directory, the project root, and
// every \graphicspath entry resolved against both. It also lets the extension be omitted.
//
// One rule, shared by the hover thumbnail and the rendered image node. While these were separate,
// the tooltip resolved a figure through \graphicspath and the page joined it onto the open file's
// directory instead - so the same image previewed on hover and 403'd in the document.
import { joinPath, dirname } from '$lib/workspace/fileSystem';
import { codeOnly } from '$lib/languages/latex/texCode';
import { searchDirsIn } from '$lib/languages/latex/knowledge/calls/fileCommands';
import { graphicExtensionsFor } from '$lib/languages/latex/knowledge/registries/graphicExtensions';
import { compileEngine } from '$lib/languages/latex/intellisense/packages/loadedPackages';

// the formats an <img> shows
const BROWSER_EXTENSIONS = new Set(['.png', '.jpg', '.jpeg', '.webp', '.gif', '.svg']);

/** the file names an <img> can load for a graphic as written; `accepts` is the extensions its command takes, the engine's when it names none */
export function browserGraphicNames(rel: string, accepts?: string[]): string[] {
	const cand = rel.replace(/\\/g, '/');
	const ext = /\.[a-z]+$/i.exec(cand)?.[0];
	if (ext) return BROWSER_EXTENSIONS.has(ext.toLowerCase()) ? [cand] : [];
	return (accepts ?? graphicExtensionsFor(compileEngine())).filter((e) => BROWSER_EXTENSIONS.has(e.toLowerCase())).map((e) => cand + e);
}

export type GraphicSearchOpts = {
	root: string | null;
	loadedPath: string | null;
	/** the source to read \graphicspath out of */
	source: string;
};

/**
 * The directories a relative graphic could live in, in search order.
 *
 * \graphicspath entries are resolved against BOTH the open file's directory and the project root.
 * The engine reads them relative to the compilation root, but an \input-ed chapter is edited on
 * its own and reaching for its own sibling folder is common enough that trying both costs one
 * probe and saves a broken figure.
 */
export function graphicSearchDirs(opts: GraphicSearchOpts): string[] {
	const base = opts.loadedPath ? dirname(opts.loadedPath) : null;
	const dirs: (string | null)[] = [base, opts.root];
	for (const d of searchDirsIn(codeOnly(opts.source))) {
		for (const parent of [base, opts.root]) if (parent) dirs.push(joinPath(parent, d));
	}
	return [...new Set(dirs.filter((d): d is string => !!d))];
}

/** every URL a relative graphic could resolve to; the tooltip's <img> advances past the misses. */
export function graphicCandidateUrls(rel: string, opts: GraphicSearchOpts & { fileUrl: (p: string) => string }): string[] {
	const cand = rel.replace(/\\/g, '/');
	const names = /\.[a-z]+$/i.test(cand) ? [cand] : browserGraphicNames(cand);
	const urls: string[] = [];
	for (const dir of graphicSearchDirs(opts)) for (const n of names) urls.push(opts.fileUrl(joinPath(dir, n)));
	return [...new Set(urls)];
}
