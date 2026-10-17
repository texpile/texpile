// the package data format, version 1 (package-scan/format/SPEC.md in texpile-tools)
import type { Engine } from '$lib/workspace/compileCommand';

export type Role =
	| 'text'
	| 'label'
	| 'citekey'
	| 'file'
	| 'graphic'
	| 'bibfile'
	| 'dir'
	| 'url'
	| 'package'
	| 'class'
	| 'library'
	| 'options'
	| 'date'
	| 'macro'
	| 'environment'
	| 'arity'
	| 'default'
	| 'spec'
	| 'body'
	| 'begin'
	| 'end'
	| 'source'
	| 'color'
	| 'counter'
	| 'pagestyle'
	| 'colspec'
	| 'language'
	| 'bibstyle'
	| 'glossary'
	| 'acronym';

export type Argument = {
	/** xparse's letter with its delimiters: m, o, s, v, d(), t+ … */
	kind: string;
	default?: string;
	placeholder?: string;
	role?: Role | Role[];
	part?: 'heading' | 'short' | 'caption' | 'footnote';
	list?: true;
	defines?: 'new' | 'renew' | 'provide';
	loads?: true;
	library?: string;
	ext?: string;
	appends?: 'missing' | 'always';
	accepts?: string[];
	from?: 'main' | 'file';
	under?: number;
	mode?: 'math' | 'text';
	keys?: string[];
	values?: string[];
};

/** null sets a field back to its default in an entry that stacks on another */
type Stackable<T> = { [K in keyof T]?: T[K] | null };

export type CommandFields = Stackable<{
	/** absent: unknown, the parser guesses; []: takes none */
	args: Argument[];
	repeat: Argument[];
	in: 'math' | 'text';
	section: number;
	cite: string;
	declares: 'font' | 'size' | 'color' | 'align';
	betweenRows: true;
	conditional: true;
	prints: string;
	mathClass: string;
	register: string;
	value: string;
	doc: string;
	hidden: true;
}> & { if?: string; alias?: string; remove?: true };

export type CommandEntry = CommandFields & { name: string };

export type EnvironmentFields = Stackable<{
	args: Argument[];
	in: 'math';
	body: 'math-display' | 'math-inline' | 'verbatim' | 'literal' | 'comment' | 'code';
	item: string[];
	labels: true;
	cells: true;
	numbering: 'per-row' | 'single';
	float: string;
	prints: string;
	doc: string;
	hidden: true;
}> & { if?: string; remove?: true };

export type EnvironmentEntry = EnvironmentFields & { name: string; star?: EnvironmentFields };

export type Key = {
	key: string;
	bare?: true;
	placeholder?: string;
	values?: string[];
	default?: string;
	role?: Role;
	defines?: 'new' | 'renew' | 'provide';
	if?: string;
};

export type Dependency = { id: string; if?: string; engines?: Engine[] };

export type PackageFile = {
	version: 1;
	deps?: Dependency[];
	macros?: CommandEntry[];
	envs?: EnvironmentEntry[];
	keys?: Record<string, Key[]>;
	disables?: string[];
	ligatures?: { input: string; prints: string }[];
};
