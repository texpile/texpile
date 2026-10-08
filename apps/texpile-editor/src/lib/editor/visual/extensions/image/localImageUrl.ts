// the url a figure's src is shown from
import { isRemoteSrc, joinPath } from '$lib/workspace/fileSystem';
import { editorFileUrl, editorGraphicDirs } from '$lib/editor/visual/fileAccess';
import { resolveGraphicUrl } from './graphicSrcResolve';
import { pdfPageImageUrl } from './pdfImageSource';

// shown in place of any http(s) image src. The app promises no network, and the packaged CSP
// already refuses the fetch (img-src carries no https:): this makes the policy visible instead
// of a broken-image icon, and closes the dev-server build, which has no CSP and would fetch.
// Display-only: attrs.src keeps the original URL, so serialization round-trips exactly.
const REMOTE_IMAGE_BLOCKED =
	'data:image/svg+xml;utf8,' +
	encodeURIComponent(
		// flat empty-state card: subtle translucent fill, lucide's image-off glyph (verbatim path
		// data, so it matches the app's icon set) + quiet label. Vector, so it scales; the muted
		// grays read on light and dark backgrounds alike.
		'<svg xmlns="http://www.w3.org/2000/svg" width="480" height="120" viewBox="0 0 480 120">' +
			'<rect width="480" height="120" fill="#80808018" rx="8"/>' +
			'<g transform="translate(222,24) scale(1.5)" stroke="#8a8a8a" stroke-width="2" fill="none" stroke-linecap="round" stroke-linejoin="round">' +
			'<line x1="2" x2="22" y1="2" y2="22"/>' +
			'<path d="M10.41 10.41a2 2 0 1 1-2.83-2.83"/>' +
			'<line x1="13.5" x2="6" y1="13.5" y2="21"/>' +
			'<line x1="18" x2="21" y1="12" y2="15"/>' +
			'<path d="M3.59 3.59A1.99 1.99 0 0 0 3 5v14a2 2 0 0 0 2 2h14c.55 0 1.052-.22 1.41-.59"/>' +
			'<path d="M21 15V5a2 2 0 0 0-2-2H9"/>' +
			'</g>' +
			'<text x="240" y="98" text-anchor="middle" font-family="system-ui" font-size="14" fill="#8a8a8a">Remote image blocked</text>' +
			'</svg>'
	);

async function urlExists(url: string): Promise<boolean> {
	try {
		return (await fetch(url, { method: 'HEAD', cache: 'no-store' })).ok;
	} catch {
		return false;
	}
}

// what each src last resolved to among the dirs it was looked for in: a view built again draws from it at once
const resolvedUrls = new Map<string, string>();

function graphicDirs(imageDir?: () => string): string[] {
	const dirs = editorGraphicDirs();
	return dirs.length ? dirs : imageDir ? [imageDir()] : [];
}

/** the url `src` resolved to last time, among the same dirs, if it has been */
export function knownLocalImageUrl(src: string, imageDir?: () => string): string | null {
	return resolvedUrls.get(`${src}\n${graphicDirs(imageDir).join('\n')}`) ?? null;
}

/**
 * The relative path resolved to a served URL; already-resolved local srcs pass through. Extensionless
 * srcs probe like the engine would, and PDF figures render to a bitmap.
 */
export async function localImageUrl(src: string, imageDir?: () => string): Promise<string> {
	if (/^https?:/i.test(src)) return REMOTE_IMAGE_BLOCKED;
	if (!src || isRemoteSrc(src) || /^(data:|blob:|file:)/.test(src)) return src;
	// the injected dirs carry \graphicspath and the project root; imageDir alone is the
	// fallback for a workspace that has not published them (a guest, or before first parse)
	const dirs = graphicDirs(imageDir);
	const { url, isPdf } = await resolveGraphicUrl(src, (rel) => dirs.map((d) => editorFileUrl(joinPath(d, rel))), urlExists);
	// failed render falls through to the raw URL, whose <img> error shows not-found
	const shown = isPdf ? ((await pdfPageImageUrl(url)) ?? url) : url;
	if (shown) resolvedUrls.set(`${src}\n${dirs.join('\n')}`, shown);
	return shown;
}
