// cross-file intelligence for the intellisense layer: labels, definitions, glossary entries,
// sub/superscripts, bib entry positions, and .aux reference numbers gathered from every OTHER
// project file (the active buffer's own contents stay live in the editor). populated by
// workspace/projectIntel.ts; consumed by completion/hover/definition and the outline.
import { box } from '$lib/runes/box.svelte';
import type { RawOutlineItem } from '$lib/editor/visual/extensions/tableofcontents/latexHeadings';

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
	/** per-file raw outline atoms (markers included), for the merged project outline */
	outlines: Record<string, RawOutlineItem[]>;
};

export const EMPTY_PROJECT_INTEL: ProjectIntel = {
	labels: [],
	macros: [],
	envs: [],
	glossary: [],
	bibEntries: [],
	sub: [],
	sup: [],
	auxNumbers: {},
	auxPages: {},
	auxKinds: {},
	auxTitles: {},
	outlines: {}
};

export const projectIntelStore = box<ProjectIntel>(EMPTY_PROJECT_INTEL);
