// cross-file intelligence for the intellisense layer: labels, definitions, glossary entries,
// sub/superscripts, bib entry positions, and .aux reference numbers gathered from every OTHER
// project file (the active buffer's own contents stay live in the editor). populated by
// workspace/projectIntel.ts; consumed by completion/hover/definition and the outline.
import type { TocItem } from '$lib/editor/visual/extensions/tableofcontents/tocStore';
import { box } from '$lib/runes/box.svelte';
import type { RawOutlineItem } from '$lib/editor/visual/extensions/tableofcontents/latexHeadings';
import type { CompiledEntry } from '$lib/editor/visual/extensions/tableofcontents/compiled/compiledNumbers';
import type { PackageUse } from '$lib/languages/latex/intellisense/packages/packageUses';
import { NO_OWN_LITERALS, type OwnLiterals } from '$lib/languages/latex/syntax/tokens/ownSyntax';
import { PLAIN_NUMBERING, type NumberingScheme } from '$lib/languages/latex/visual/extensions/numbers/numberingScheme';

export type ProjectLabel = {
	name: string;
	file: string;
	line: number;
	/** the label's surrounding source, for hover and completion detail */
	context: string;
};

export type ProjectDef = {
	name: string;
	file: string;
	line: number;
	/** xparse-style signature for macros ("m m"); empty for zero-arg */
	signature: string;
	/** the macro's replacement text (with #1 placeholders), when capturable; lets math previews render it */
	definition?: string;
	/** an environment's end code; its begin code is the definition */
	end?: string;
	/** argument count for `definition` */
	argCount?: number;
	/** the default of #1, when it is optional */
	optional?: string;
};

export type ProjectGloss = {
	key: string;
	description: string;
	acronym: boolean;
	file: string;
	line: number;
};

export type ProjectBibEntry = {
	key: string;
	file: string;
	line: number;
};

export type ProjectIntel = {
	labels: ProjectLabel[];
	macros: ProjectDef[];
	envs: ProjectDef[];
	/** what the other files define that TeX takes as written */
	literals: OwnLiterals;
	/** the packages, classes and libraries the other files load */
	packages: PackageUse[];
	glossary: ProjectGloss[];
	bibEntries: ProjectBibEntry[];
	sub: string[];
	sup: string[];
	/** \newlabel numbers from the main file's .aux: label -> "3.2" (page in auxPages) */
	auxNumbers: Record<string, string>;
	auxPages: Record<string, string>;
	/** the counter each label numbers (figure, table ...), for the words \cref and \autoref print */
	auxKinds: Record<string, string>;
	/** the titles hyperref recorded, for \nameref */
	auxTitles: Record<string, string>;
	/** labels the compile wrote more than once, which no number is sure for */
	auxRepeated: string[];
	/** the headings, figures and tables the last compile numbered, for the Contents */
	auxContents: CompiledEntry[];
	numbering: NumberingScheme;
	/** the file that starts the document and the files it reads in, for the numbers they count */
	documentFiles: DocumentFiles;
	/** per-file raw outline atoms (markers included), for the merged project outline */
	outlines: Record<string, RawOutlineItem[]>;
	/** a .typ's headings, each with its line, and where it #includes another file */
	typstOutlines: Record<string, TypstOutline>;
};

export type DocumentFiles = {
	start: string | null;
	root: string;
	texts: Readonly<Record<string, { path: string; text: string }>>;
};

export const NO_DOCUMENT_FILES: DocumentFiles = { start: null, root: '', texts: {} };

export type TypstOutline = { items: TocItem[]; includes: { pos: number; target: string }[] };

export const EMPTY_PROJECT_INTEL: ProjectIntel = {
	labels: [],
	macros: [],
	envs: [],
	literals: NO_OWN_LITERALS,
	packages: [],
	glossary: [],
	bibEntries: [],
	sub: [],
	sup: [],
	auxNumbers: {},
	auxPages: {},
	auxKinds: {},
	auxTitles: {},
	auxRepeated: [],
	auxContents: [],
	numbering: PLAIN_NUMBERING,
	documentFiles: NO_DOCUMENT_FILES,
	outlines: {},
	typstOutlines: {}
};

export const projectIntelStore = box<ProjectIntel>(EMPTY_PROJECT_INTEL);
