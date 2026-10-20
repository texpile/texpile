// the package data format, version 1 (package-scan/format/SPEC.md in texpile-tools)
import type { Engine } from '$lib/workspace/compileCommand';

export type Role =
	| 'text'
	| 'label'
	| 'citekey'
	| 'file'
	| 'listing'
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

export type FileRole = Extract<Role, 'file' | 'listing' | 'graphic' | 'bibfile' | 'bibstyle' | 'dir' | 'package' | 'class' | 'library'>;

export const FILE_ROLES: FileRole[] = ['file', 'listing', 'graphic', 'bibfile', 'bibstyle', 'dir', 'package', 'class', 'library'];

export type CiteForm =
	| 'plain'
	| 'paren'
	| 'paren-bare'
	| 'text'
	| 'text-bare'
	| 'author'
	| 'year'
	| 'year-paren'
	| 'foot'
	| 'super'
	| 'auto'
	| 'full'
	| 'nocite';

export type Argument = {
	/** xparse's letter with its delimiters: m, o, s, v, d(), t+ … */
	kind: string;
	default?: string;
	placeholder?: string;
	role?: Role | Role[];
	part?: 'heading' | 'short' | 'caption' | 'footnote';
	list?: true;
	/** a `v` argument that may be a brace group instead of text between twin delimiter characters */
	braced?: true;
	defines?: 'new' | 'renew' | 'provide' | 'replace';
	/** what a definer creates when no argument states it */
	makes?: { args: Argument[]; in?: 'math' | 'text' };
	/** other names the call creates from this argument's value; `{}` in a name stands for the value */
	derives?: { role: 'macro' | 'environment' | 'counter'; name: string; makes?: { args: Argument[]; in?: 'math' | 'text' } }[];
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
	/** the language this argument names is declared for the document: its main one, or one it may switch to */
	declaration?: 'main' | 'other';
};

/** null sets a field back to its default in an entry that stacks on another */
type Stackable<T> = { [K in keyof T]?: T[K] | null };

export type CommandFields = Stackable<{
	/** absent: unknown, the parser guesses; []: takes none */
	args: Argument[];
	repeat: Argument[];
	in: 'math' | 'text';
	section: number;
	cite: CiteForm;
	declares: 'font' | 'size' | 'color' | 'align';
	betweenRows: true;
	conditional: true;
	prints: string;
	mathClass: 'ord' | 'op' | 'bin' | 'rel' | 'open' | 'close' | 'punct' | 'inner';
	register: 'length' | 'skip' | 'count' | 'token';
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
	/** a `\\` starts a new row of the body */
	rows: true;
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
	defines?: 'new' | 'renew' | 'provide' | 'replace';
	/** what a definer creates when no argument states it */
	makes?: { args: Argument[]; in?: 'math' | 'text' };
	declaration?: 'main' | 'other';
	if?: string;
};

export type Dependency = { id: string; if?: string; engines?: Engine[] };

type Named<T = object> = T & { name: string; if?: string };

export type Registries = {
	colors: Named<{ value?: string }>[];
	counters: Named<{ within?: string }>[];
	pageStyles: Named[];
	columnTypes: Named<{ takes?: 'width' | 'code' | 'text' | 'repeat'; like?: string; in?: string[] }>[];
	floats: Named<{ list?: string }>[];
	languages: Named<{ bcp47?: string; aliases?: string[]; variants?: { name: string; bcp47: string }[]; hyphenation?: string }>[];
	bibStyles: Named[];
	glossaryTypes: Named[];
	auxFiles: { ext: string; readBack?: true; writtenBy: 'tex' | 'bibtex' | 'biber' | 'makeindex'; if?: string }[];
	graphicExtensions: { engine: Engine | 'latex'; ext: string[] }[];
	refNames: Named<{ singular: string; plural: string; capital: string; capitalPlural: string }>[];
	bibTypes: Named<{ required?: { all?: string[]; xor?: string[]; or?: string[] }[]; alias?: string; skipout?: true; hidden?: true }>[];
	bibFields: Named<{ kind?: 'list'; datatype?: string; types?: string[]; alias?: string }>[];
};

export type PackageFile = {
	version: 1;
	deps?: Dependency[];
	macros?: CommandEntry[];
	envs?: EnvironmentEntry[];
	keys?: Record<string, Key[]>;
	disables?: string[];
	ligatures?: { input: string; prints: string }[];
	provides?: Partial<Registries>;
	engines?: Engine[];
	ctan?: string;
	/** where the options it does not know go */
	passOptions?: string[];
	shellEscape?: true;
	/** the files it fails to load after; [] probed and clean */
	clashes?: string[];
};

/** package-for.json: the file to load for a command or environment name, from the packages with a catalog rank */
export type PackageForIndex = { version: 1; macros: Record<string, string>; envs: Record<string, string> };
