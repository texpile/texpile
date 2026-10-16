// the package files a document's source names: \usepackage, its class as class-<name>, the libraries and themes it loads, and the languages it selects
/** file: the .sty or .cls a \usepackage or \documentclass names, where the project may ship it */
export type PackageUse = { name: string; options: string[]; file?: string };

// `\%` is a percent sign, `\\%` a line break and then a comment
const COMMENT = /(?<!\\)((?:\\\\)*)%.*/g;

export function withoutComments(text: string): string {
	return text.replace(COMMENT, '$1');
}
const USE =
	/\\(documentclass|usepackage|RequirePackage|usetikzlibrary|usepgflibrary|usepgfplotslibrary|tcbuselibrary|use(?:color|font|inner|outer)?theme|set(?:main|default|other)languages?|babelprovide)\s*(?:\[([^\]]*)\])?\s*\{([^{}]*)\}/g;
const FILE_PREFIX: Record<string, string> = {
	documentclass: 'class-',
	usetikzlibrary: 'tikzlibrary',
	usepgflibrary: 'pgflibrary',
	usepgfplotslibrary: 'pgfplotslibrary',
	tcbuselibrary: 'tcolorboxlibrary',
	usetheme: 'beamertheme',
	usecolortheme: 'beamercolortheme',
	usefonttheme: 'beamerfonttheme',
	useinnertheme: 'beamerinnertheme',
	useoutertheme: 'beameroutertheme'
};
// the languages a document selects, which its `if` entries name like options
const LANGUAGE_PACKAGE: Record<string, string> = {
	setmainlanguage: 'polyglossia',
	setdefaultlanguage: 'polyglossia',
	setotherlanguage: 'polyglossia',
	setotherlanguages: 'polyglossia',
	babelprovide: 'babel'
};

// tcolorbox's options name libraries, three of them a group of libraries (tcolorbox.sty)
const TCOLORBOX_GROUPS: Record<string, string[]> = {
	many: ['raster', 'skins', 'breakable', 'hooks', 'theorems', 'fitting'],
	most: ['many', 'listings', 'external', 'magazine', 'vignette', 'poster'],
	all: ['many', 'minted', 'listings', 'external', 'magazine', 'vignette', 'poster', 'documentation', 'xparse']
};

function tcolorboxLibraries(names: string[]): string[] {
	return names.flatMap((n) => (TCOLORBOX_GROUPS[n] ? tcolorboxLibraries(TCOLORBOX_GROUPS[n]) : [n]));
}

/** a comma list such as package options, one item per entry */
export function listOf(text: string | undefined): string[] {
	return (text ?? '')
		.split(',')
		.map((item) => item.trim().replace(/\s*=\s*/, '='))
		.filter(Boolean);
}

let cache: { text: string; uses: PackageUse[] } | null = null;

export function packageUsesIn(text: string): PackageUse[] {
	if (cache?.text === text) return cache.uses;
	const uses: PackageUse[] = [];
	for (const m of withoutComments(text).matchAll(USE)) {
		const names = listOf(m[3]);
		if (LANGUAGE_PACKAGE[m[1]]) {
			uses.push({ name: LANGUAGE_PACKAGE[m[1]], options: names });
			continue;
		}
		const options = listOf(m[2]).flatMap((o) => (o.startsWith('main=') ? [o, o.slice(5)] : [o]));
		const ext = m[1] === 'documentclass' ? '.cls' : /^(?:usepackage|RequirePackage)$/.test(m[1]) ? '.sty' : '';
		for (const name of m[1] === 'tcbuselibrary' ? tcolorboxLibraries(names) : names)
			uses.push({ name: (FILE_PREFIX[m[1]] ?? '') + name, options, ...(ext ? { file: name + ext } : {}) });
		// a TikZ library is mostly the PGF library of its name (arrows.meta, shapes.geometric)
		if (m[1] === 'usetikzlibrary') for (const name of names) uses.push({ name: `pgflibrary${name}`, options: [] });
		if (m[1] === 'usepackage' && names.includes('tcolorbox'))
			for (const library of tcolorboxLibraries(options)) uses.push({ name: `tcolorboxlibrary${library}`, options: [] });
	}
	cache = { text, uses };
	return uses;
}
