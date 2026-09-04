// The docs tree, read from the markdown files under /docs at the repo root. One file is one page,
// and a folder's README.md is the page for the folder itself, so the same files read on GitHub.

const FILES = import.meta.glob('../../../../docs/**/*.md', { query: '?raw', import: 'default', eager: true }) as Record<string, string>;
const PREFIX = '../../../../docs/';

export interface Doc {
	/** '' for the index, otherwise the path under /docs, e.g. "installation/latex/windows" */
	slug: string;
	/** the file under /docs, e.g. "installation/latex/windows.md" */
	file: string;
	/** the page's `# heading` */
	title: string;
	/** sidebar label; the title unless the front matter says otherwise */
	nav: string;
	description: string;
	/** the one-line summary on a card; falls back to the description */
	blurb: string;
	/** a lucide icon name, or windows / apple / linux for the platform mark */
	icon?: string;
	order: number;
	/** the sidebar group; top-level pages only, and every one of them has one */
	section?: string;
	/** markdown after the front matter */
	body: string;
	children: Doc[];
}

// key: value lines between two --- fences. Values are plain text, never quoted or nested, so
// splitting on the first colon is the whole parser.
function parse(file: string, src: string): Doc {
	const m = /^---\r?\n([\s\S]*?)\r?\n---\r?\n/.exec(src);
	if (!m) throw new Error(`docs/${file}: missing front matter`);
	const fm: Record<string, string> = {};
	for (const line of m[1].split(/\r?\n/)) {
		const i = line.indexOf(':');
		if (i > 0) fm[line.slice(0, i).trim()] = line.slice(i + 1).trim();
	}
	const body = src.slice(m[0].length);
	const title = /^# (.+)$/m.exec(body)?.[1].trim();
	if (!title) throw new Error(`docs/${file}: no # heading`);
	if (!fm.description) throw new Error(`docs/${file}: front matter needs a description`);
	const slug = file.replace(/\.md$/, '').replace(/(^|\/)README$/, '');
	return {
		slug,
		file,
		title,
		nav: fm.nav || title,
		description: fm.description,
		blurb: fm.blurb || fm.description,
		icon: fm.icon,
		order: Number(fm.order ?? 0),
		section: fm.section,
		body,
		children: []
	};
}

/** every page by slug; the index page ('') holds the top-level topics as its children */
export const DOCS: Record<string, Doc> = {};
for (const [key, src] of Object.entries(FILES)) {
	const doc = parse(key.slice(PREFIX.length), src);
	DOCS[doc.slug] = doc;
}
for (const doc of Object.values(DOCS)) {
	if (doc.slug === '') continue;
	const parent = DOCS[doc.slug.includes('/') ? doc.slug.slice(0, doc.slug.lastIndexOf('/')) : ''];
	if (!parent) throw new Error(`docs/${doc.file}: its folder has no README.md`);
	parent.children.push(doc);
}
for (const doc of Object.values(DOCS)) {
	doc.children.sort((a, b) => a.order - b.order || a.nav.localeCompare(b.nav));
}
for (const doc of DOCS[''].children) if (!doc.section) throw new Error(`docs/${doc.file}: a top-level page needs a section`);

export interface NavNode {
	slug: string;
	title: string;
	/** top-level nodes only; the sidebar groups consecutive nodes that share one */
	section?: string;
	children: NavNode[];
}

/** the sidebar tree: slugs, labels and sections only, small enough to ship with every page */
export function navTree(docs: Doc[] = DOCS[''].children): NavNode[] {
	return docs.map((d) => ({ slug: d.slug, title: d.nav, section: d.section, children: navTree(d.children) }));
}
