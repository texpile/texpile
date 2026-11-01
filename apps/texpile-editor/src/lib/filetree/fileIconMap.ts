// Which vendored icon a file gets. Deliberately scoped to a writing workspace's contents -
// documents, references, figures, media, archives - plus the handful of repo files any project
// carries. No programming-language icons: this is a LaTeX/Markdown editor, not an IDE, and every
// unmapped extension falls through to the generic document glyph rather than growing this table.
//
// Icons are loaded eagerly as raw strings (a few hundred bytes each, inlined at build time), so
// a tree row never waits on a network/chunk fetch to draw.
const ICONS = import.meta.glob('$lib/assets/fileicons/*.svg', {
	query: '?raw',
	import: 'default',
	eager: true
}) as Record<string, string>;

/** icon name -> markup, keyed off the file's basename rather than its full path */
const BY_NAME: Record<string, string> = Object.fromEntries(
	Object.entries(ICONS).map(([path, svg]) => [
		path
			.split('/')
			.pop()!
			.replace(/\.svg$/, ''),
		svg
	])
);

/** exact filenames (lowercased, extension included) that beat extension matching */
const BY_FILENAME: Record<string, string> = {
	'readme.md': 'readme',
	'readme.markdown': 'readme',
	'readme.txt': 'readme',
	license: 'license',
	'license.md': 'license',
	'license.txt': 'license',
	licence: 'license',
	copying: 'license',
	'.gitignore': 'git',
	'.gitattributes': 'git',
	'.gitmodules': 'git'
};

const BY_EXT: Record<string, string> = {
	// documents the editor opens
	tex: 'tex',
	ltx: 'tex',
	cls: 'tex',
	sty: 'tex',
	typ: 'typst',
	md: 'markdown',
	markdown: 'markdown',
	mdx: 'markdown',
	bib: 'bibliography',
	pdf: 'pdf',
	txt: 'document',
	rtf: 'document',
	// figures
	png: 'image',
	jpg: 'image',
	jpeg: 'image',
	gif: 'image',
	webp: 'image',
	bmp: 'image',
	ico: 'image',
	tif: 'image',
	tiff: 'image',
	eps: 'image',
	svg: 'svg',
	tikz: 'tikz',
	// data / build output
	csv: 'table',
	tsv: 'table',
	log: 'log',
	json: 'json',
	yml: 'yaml',
	yaml: 'yaml',
	// office documents a writer may keep alongside
	doc: 'word',
	docx: 'word',
	odt: 'word',
	ppt: 'powerpoint',
	pptx: 'powerpoint',
	// media & archives
	mp4: 'video',
	mov: 'video',
	webm: 'video',
	mkv: 'video',
	mp3: 'audio',
	wav: 'audio',
	ogg: 'audio',
	flac: 'audio',
	zip: 'zip',
	gz: 'zip',
	tar: 'zip',
	tgz: 'zip',
	'7z': 'zip',
	rar: 'zip',
	ttf: 'font',
	otf: 'font',
	woff: 'font',
	woff2: 'font'
};

/**
 * The folder glyph, open when the row is expanded. Kept separate from fileIconSvg because a
 * directory has no extension to match on — the pack also ships ~200 name-matched folder variants
 * (folder-images, folder-dist, ...), deliberately not vendored: they'd colour-code a writing
 * workspace by conventions borrowed from source trees.
 */
export function folderIconSvg(open: boolean): string | null {
	return BY_NAME[open ? 'folder-open' : 'folder'] ?? null;
}

/**
 * The icon markup for a file, or null to fall back to the caller's default.
 * `name` may be a bare filename or a full path.
 */
export function fileIconSvg(name: string): string | null {
	const base = (name.split(/[\\/]/).pop() ?? '').toLowerCase();
	// no name yet (the create-file row before anything is typed) is just another unmapped name:
	// it takes the generic glyph so the row's icon slot doesn't collapse
	if (!base) return BY_NAME.document ?? null;
	const byFilename = BY_FILENAME[base];
	if (byFilename && BY_NAME[byFilename]) return BY_NAME[byFilename];
	// last segment only: "paper.final.tex" is a .tex, and dotfiles have no extension
	const dot = base.lastIndexOf('.');
	const ext = dot > 0 ? base.slice(dot + 1) : '';
	const icon = BY_EXT[ext];
	return (icon && BY_NAME[icon]) || BY_NAME.document || null;
}
