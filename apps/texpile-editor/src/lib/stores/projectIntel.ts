// cross-file intelligence for the intellisense layer: labels, definitions, glossary entries,
// sub/superscripts, bib entry positions, and .aux reference numbers gathered from every OTHER
// project file (the active buffer's own contents stay live in the editor). populated by
// workspace/projectIntel.ts; consumed by completion/hover/definition and the outline.
import { writable } from 'svelte/store';
import type { RawOutlineItem } from '$lib/editor/extensions/tableofcontents/latexHeadings';

export interface ProjectLabel {
	name: string;
	file: string;
	line: number;
	/** the label's surrounding source, for hover and completion detail */
	context: string;
}

export interface ProjectDef {
	name: string;
	file: string;
	line: number;
	/** xparse-style signature for macros ("m m"); empty for zero-arg */
	signature: string;
	/** the macro's replacement text (with #1 placeholders), when capturable; lets math previews render it */
	definition?: string;
	/** argument count for `definition` */
	argCount?: number;
}

export interface ProjectGloss {
	key: string;
	description: string;
	acronym: boolean;
	file: string;
	line: number;
}

export interface ProjectBibEntry {
	key: string;
	file: string;
	line: number;
}

export interface ProjectIntel {
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
	/** per-file raw outline atoms (markers included), for the merged project outline */
	outlines: Record<string, RawOutlineItem[]>;
}

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
	outlines: {}
};

export const projectIntelStore = writable<ProjectIntel>(EMPTY_PROJECT_INTEL);
