// The folder a saved template lives in, named after what the user called it. Readable in a file
// manager, safe on every filesystem the app runs on, and never the same as a neighbor's.

const MAX_SLUG = 48;

// a folder called con or aux cannot be created on Windows, extension or not
const WINDOWS_RESERVED = /^(con|prn|aux|nul|com\d|lpt\d)$/;

/** the name as a folder name: lowercase ASCII letters, digits and dashes */
export function templateSlug(name: string): string {
	const slug = name
		.normalize('NFKD')
		.replace(/[̀-ͯ]/g, '')
		.toLowerCase()
		.replace(/[^a-z0-9]+/g, '-')
		.slice(0, MAX_SLUG)
		.replace(/^-+|-+$/g, '');
	if (!slug) return 'template';
	return WINDOWS_RESERVED.test(slug) ? `template-${slug}` : slug;
}

/**
 * The slug, or the slug with the first free number after it.
 *
 * Compared without case: macOS and Windows filesystems treat "Paper" and "paper" as one folder, and
 * two names differing only in punctuation ("My paper!" and "my paper?") share a slug anyway.
 */
export function uniqueTemplateId(name: string, taken: readonly string[]): string {
	const base = templateSlug(name);
	const used = new Set(taken.map((id) => id.toLowerCase()));
	if (!used.has(base)) return base;
	for (let n = 2; ; n++) {
		const candidate = `${base}-${n}`;
		if (!used.has(candidate)) return candidate;
	}
}

/** an id the renderer sent back: one plain folder name, never a path or a hidden folder */
export function isTemplateId(id: unknown): id is string {
	return typeof id === 'string' && /^[a-z0-9][a-z0-9-]*$/.test(id) && id.length <= MAX_SLUG + 12;
}
