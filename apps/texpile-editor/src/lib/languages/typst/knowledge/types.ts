// the shape of the Typst package data (package-scan/typst/SPEC.md in texpile-tools)

export type TypstArgRole = 'text' | 'label' | 'citekey' | 'glossary' | 'entries' | 'acronyms' | 'url' | 'file';

export type TypstTitlePart = 'title' | 'subtitle' | 'author' | 'date' | 'abstract' | 'keywords';

export type TypstParam = {
	name: string;
	positional?: true;
	named?: true;
	variadic?: true;
	required?: true;
	default?: string;
	into?: string;
	content?: true;
	role?: TypstArgRole;
	part?: TypstTitlePart;
	types?: string[];
	settable?: true;
};

export type TypstEntryKind = 'function' | 'element' | 'value' | 'module' | 'type' | 'unknown';

export type TypstEntry = {
	kind: TypstEntryKind;
	group?: string;
	params?: TypstParam[];
	block?: boolean | 'content';
	blockParam?: string;
	prints?: string;
	value?: string;
	returns?: string[];
	scope?: Record<string, TypstEntry>;
	from?: string;
	alias?: string;
	/** what the function a call makes prints (`thmbox("theorem", "Theorem")`), in markup: `{param}` for the call's
	 *  argument, `{.number}` its count, `{.note}` its own one positional argument, `{.body}` its content; `headKeeps`:
	 *  the named arguments a call of the maker can add without changing the head */
	makes?: { prints: string; printsNoted?: string; headKeeps?: string[] };
	round?: true;
	mono?: true;
	invisible?: true;
	hidden?: true;
	picture?: true;
	glossary?: TypstGlossaryUse;
};

/** `{short}`, `{long}`, `{plural}`, `{longplural}`, `{description}` and `{key}` stand for the entry's fields, `{Short}` and
 *  the like for the same with a capital first letter. A plural an entry leaves out is its short or long form with an s */
export type TypstGlossaryUse = {
	first: string;
	next: string;
	flags?: Record<string, string>;
};

export type TypstPackageFile = {
	version: 1;
	id: string;
	names: Record<string, TypstEntry>;
	reexports?: Record<string, '*' | string[]>;
};

export type TypstPackageSpec = { namespace: string; name: string; version: string };
