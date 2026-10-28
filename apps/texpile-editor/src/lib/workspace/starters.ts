// starter templates: real .tex/.typ/.bib files under ./starters/<id>/, bundled as raw strings at
// build time; to change a starter, edit those files. the canonical package set is the article
// starter's preamble; apa tailors its own because the apa7 class preloads packages that clash
// when re-loaded with different options. only bundle content we can freely redistribute
// (no IEEEtran.cls and friends). the Typst starters use the standard library alone: a fresh
// tinymist with no network has to compile every one of them.
import { joinPath } from './fileSystem';
import { m } from '$lib/paraglide/messages';
import { fileService } from '$lib/files/service/fileService';

// keys look like "./starters/mla/main.tex" or "./starters/typst-report/chapters/method.typ"; vite
// inlines the contents eagerly as strings
const RAW = import.meta.glob('./starters/*/**/*.{tex,bib,typ,svg}', {
	query: '?raw',
	import: 'default',
	eager: true
}) as Record<string, string>;

export type Starter = {
	id: string;
	name: string;
	description: string;
	/**
	 * Which typesetter this starter is for; the picker groups by it.
	 *
	 * Not merely a label: applyStarter sets mainFile as the project's main file, and the main file's
	 * extension is the ONLY thing choosing the compiler (see effectiveCompileFormat). So a starter's
	 * lang and its mainFile extension have to agree, or the folder it creates will not build.
	 */
	lang: 'latex' | 'typst';
	/** the file the editor opens after the starter is applied. */
	mainFile: string;
	/** relative path -> file contents, written verbatim into the folder. */
	files: Record<string, string>;
};

/** gathers the bundled text files for a starter id. */
function filesFor(id: string): Record<string, string> {
	const prefix = `./starters/${id}/`;
	const out: Record<string, string> = {};
	for (const [key, content] of Object.entries(RAW)) {
		if (key.startsWith(prefix)) out[key.slice(prefix.length)] = content;
	}
	return out;
}

/** a Typst starter: every one opens on main.typ, the file its lang promises the compiler */
function typstStarter(id: string, name: () => string, description: () => string): Starter {
	return {
		id,
		get name() {
			return name();
		},
		get description() {
			return description();
		},
		lang: 'typst',
		mainFile: 'main.typ',
		files: filesFor(id)
	};
}

// name/description are getters so the label is resolved at read time, not at module-eval time
// (a locale set after this module loads would otherwise be frozen to the boot locale).
export const STARTERS: Starter[] = [
	{
		id: 'article',
		get name() {
			return m.starterdef_article_name();
		},
		get description() {
			return m.starterdef_article_description();
		},
		lang: 'latex',
		mainFile: 'main.tex',
		files: filesFor('article')
	},
	{
		id: 'mla',
		get name() {
			return m.starterdef_mla_name();
		},
		get description() {
			return m.starterdef_mla_description();
		},
		lang: 'latex',
		mainFile: 'main.tex',
		files: filesFor('mla')
	},
	{
		id: 'apa',
		get name() {
			return m.starterdef_apa_name();
		},
		get description() {
			return m.starterdef_apa_description();
		},
		lang: 'latex',
		mainFile: 'main.tex',
		files: filesFor('apa')
	},
	typstStarter(
		'typst-paper',
		() => m.starterdef_typst_paper_name(),
		() => m.starterdef_typst_paper_description()
	),
	typstStarter(
		'typst-report',
		() => m.starterdef_typst_report_name(),
		() => m.starterdef_typst_report_description()
	),
	typstStarter(
		'typst-letter',
		() => m.starterdef_typst_letter_name(),
		() => m.starterdef_typst_letter_description()
	),
	typstStarter(
		'typst-slides',
		() => m.starterdef_typst_slides_name(),
		() => m.starterdef_typst_slides_description()
	),
	// Deliberately bare: one line of prose and nothing else. It still has to be a STARTER rather than
	// a blank-file link, because only applyStarter sets the result as the main file - and with the
	// format switch gone, a .typ that is not the main file leaves the folder compiling as LaTeX.
	typstStarter(
		'typst-empty',
		() => m.starterdef_typst_empty_name(),
		() => m.starterdef_typst_empty_description()
	)
];

export function starterById(id: string): Starter | undefined {
	return STARTERS.find((s) => s.id === id);
}

/** a text file chosen through the "Import your own" starter card. */
export type ImportedFile = {
	name: string;
	content: string;
};

/** picks the file to open: the first .tex with \begin{document}, else the first .tex, else null. */
export function pickImportMain(files: ImportedFile[]): string | null {
	const tex = files.filter((f) => f.name.toLowerCase().endsWith('.tex'));
	return tex.find((f) => f.content.includes('\\begin{document}'))?.name ?? tex[0]?.name ?? null;
}

/** writes imported files into root (never overwriting) and returns the path to open, or null with no .tex. */
export async function applyImportedFiles(root: string, files: ImportedFile[]): Promise<string | null> {
	for (const f of files) {
		const path = joinPath(root, f.name);
		if (await fileService.exists(path)) continue; // keep the user's existing file
		await fileService.writeText(path, f.content);
	}
	const main = pickImportMain(files);
	return main ? joinPath(root, main) : null;
}

/**
 * Writes a starter's files into root and returns its main file path. Existing files are never
 * overwritten: the folder may already hold the user's own data (a references.bib, say).
 */
export async function applyStarter(root: string, starter: Starter): Promise<string> {
	for (const [rel, content] of Object.entries(starter.files)) {
		const path = joinPath(root, rel);
		if (await fileService.exists(path)) continue; // keep the user's existing file
		await fileService.writeText(path, content);
	}
	return joinPath(root, starter.mainFile);
}
