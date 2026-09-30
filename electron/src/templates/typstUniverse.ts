// The Typst Universe template list: packages.typst.org's package index, cut down to the entries
// that are templates, at the newest version the user's tinymist can compile. Fetched only when the
// user opens the gallery; the app makes no other request to this host.

const INDEX_URL = 'https://packages.typst.org/preview/index.json';
const THUMBNAIL_BASE = 'https://packages.typst.org/preview/thumbnails';
const TIMEOUT_MS = 20_000;
// the list barely changes within a sitting; reopening the gallery should not download it again
const INDEX_FRESH_MS = 15 * 60 * 1000;
const PACKAGE_NAME = /^[a-z0-9][a-z0-9-]*$/;
const PACKAGE_VERSION = /^\d+\.\d+\.\d+$/;

export type UniverseTemplate = {
	name: string;
	version: string;
	description: string;
	/** display names, without the contact part of "Name <email>" */
	authors: string[];
	keywords: string[];
	categories: string[];
	/** the package ships a thumbnail, which the registry serves as a small webp */
	thumbnail: boolean;
};

export type TemplateIndex = { ok: true; templates: UniverseTemplate[] } | { ok: false; reason: 'offline' | 'failed'; error?: string };

export type Thumbnail = { ok: true; bytes: Uint8Array; type: string } | { ok: false };

type Fetch = (url: string, init: RequestInit) => Promise<Response>;

function strings(value: unknown): string[] {
	return Array.isArray(value) ? value.filter((v): v is string => typeof v === 'string') : [];
}

function authorName(author: string): string {
	return author.replace(/<[^>]*>/g, '').trim();
}

/** true when version `a` is newer than `b` (both start X.Y.Z) */
function newer(a: string, b: string): boolean {
	const pa = a.split(/[.-]/, 3).map(Number);
	const pb = b.split(/[.-]/, 3).map(Number);
	for (let i = 0; i < 3; i++) if (pa[i] !== pb[i]) return pa[i] > pb[i];
	return false;
}

/** the manifest's `compiler`, the oldest Typst the version builds with, is not newer than `typst` */
function buildsWith(entry: unknown, typst: string | null): boolean {
	const compiler = (entry as Record<string, unknown>).compiler;
	if (!typst || !/^\d+\.\d+\.\d+/.test(typst) || typeof compiler !== 'string' || !PACKAGE_VERSION.test(compiler)) return true;
	return !newer(compiler, typst);
}

function templateOf(entry: unknown): UniverseTemplate | null {
	if (!entry || typeof entry !== 'object') return null;
	const e = entry as Record<string, unknown>;
	const template = e.template as Record<string, unknown> | undefined;
	if (typeof e.name !== 'string' || !PACKAGE_NAME.test(e.name)) return null;
	if (typeof e.version !== 'string' || !PACKAGE_VERSION.test(e.version)) return null;
	if (!template || typeof template !== 'object' || typeof template.entrypoint !== 'string') return null;
	return {
		name: e.name,
		version: e.version,
		description: typeof e.description === 'string' ? e.description : '',
		authors: strings(e.authors).map(authorName).filter(Boolean),
		keywords: strings(e.keywords),
		categories: strings(e.categories),
		thumbnail: typeof template.thumbnail === 'string'
	};
}

/**
 * The templates in a package index, one per package at its newest version, by name. With `typst`,
 * the Typst version tinymist compiles with, a version that needs a newer Typst is passed over.
 *
 * The index lists every version of every package; only the ones with a `template` section are
 * templates. Anything malformed is skipped rather than failing the list: the name and version end
 * up in a URL and in the package spec handed to tinymist, so they are checked strictly.
 */
export function templatesFromIndex(index: unknown, typst: string | null = null): UniverseTemplate[] {
	const newest = new Map<string, UniverseTemplate>();
	for (const entry of Array.isArray(index) ? index : []) {
		const t = templateOf(entry);
		if (!t || !buildsWith(entry, typst)) continue;
		const seen = newest.get(t.name);
		if (!seen || newer(t.version, seen.version)) newest.set(t.name, t);
	}
	return [...newest.values()].sort((a, b) => a.name.localeCompare(b.name));
}

let cached: { at: number; index: unknown[] } | null = null;

/** `typst` is the Typst version of the tinymist that creates the project, null when none was found */
export async function fetchTemplateIndex(fetch: Fetch, userAgent: string, typst: string | null = null): Promise<TemplateIndex> {
	if (cached && Date.now() - cached.at < INDEX_FRESH_MS) return { ok: true, templates: templatesFromIndex(cached.index, typst) };
	let res: Response;
	try {
		res = await fetch(INDEX_URL, { headers: { 'User-Agent': userAgent }, signal: AbortSignal.timeout(TIMEOUT_MS) });
	} catch (e) {
		return { ok: false, reason: 'offline', error: e instanceof Error ? e.message : String(e) };
	}
	if (!res.ok) return { ok: false, reason: 'failed', error: `HTTP ${res.status}` };
	let parsed: unknown;
	try {
		parsed = await res.json();
	} catch (e) {
		return { ok: false, reason: 'failed', error: e instanceof Error ? e.message : String(e) };
	}
	if (!Array.isArray(parsed) || !templatesFromIndex(parsed).length)
		return { ok: false, reason: 'failed', error: 'The index lists no templates.' };
	cached = { at: Date.now(), index: parsed };
	return { ok: true, templates: templatesFromIndex(parsed, typst) };
}

/** forget the cached list; for tests */
export function clearTemplateIndexCache(): void {
	cached = null;
}

export function thumbnailUrl(name: string, version: string): string | null {
	if (!PACKAGE_NAME.test(name) || !PACKAGE_VERSION.test(version)) return null;
	return `${THUMBNAIL_BASE}/${name}-${version}-small.webp`;
}

/** a template's preview image; the page cannot load it itself, its CSP allows no remote images */
export async function fetchThumbnail(fetch: Fetch, userAgent: string, name: unknown, version: unknown): Promise<Thumbnail> {
	const url = typeof name === 'string' && typeof version === 'string' ? thumbnailUrl(name, version) : null;
	if (!url) return { ok: false };
	try {
		const res = await fetch(url, { headers: { 'User-Agent': userAgent }, signal: AbortSignal.timeout(TIMEOUT_MS) });
		const type = res.headers.get('content-type') ?? '';
		if (!res.ok || !type.startsWith('image/')) return { ok: false };
		return { ok: true, bytes: new Uint8Array(await res.arrayBuffer()), type };
	} catch {
		return { ok: false };
	}
}
