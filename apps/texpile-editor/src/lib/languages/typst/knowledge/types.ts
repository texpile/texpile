// the shape of the Typst package data (package-scan/typst/SPEC.md in texpile-tools)

/** what an argument holds, for the readers that draw or check it */
export type TypstArgRole = 'text' | 'label' | 'citekey' | 'glossary' | 'entries' | 'acronyms' | 'url' | 'file';

/** the part of the title block a template's parameter sets, as LaTeX's data names an argument's `part` */
export type TypstTitlePart = 'title' | 'subtitle' | 'author' | 'date' | 'abstract' | 'keywords';

export type TypstParam = {
	name: string;
	positional?: true;
	named?: true;
	/** `..rest`: takes any number of arguments */
	variadic?: true;
	required?: true;
	/** the Typst written as its default */
	default?: string;
	/** `..rest`: the Typst function the named arguments it takes are passed on to (`block`) */
	into?: string;
	/** takes content */
	content?: true;
	role?: TypstArgRole;
	part?: TypstTitlePart;
	/** std only: the types it accepts, a value's repr where only some values are */
	types?: string[];
	settable?: true;
};

/** `unknown`: a name a package re-exports from one the data does not hold */
export type TypstEntryKind = 'function' | 'element' | 'value' | 'module' | 'type' | 'unknown';

export type TypstEntry = {
	kind: TypstEntryKind;
	/** std: the folder of Typst's library the definition is in (`layout`, `model`, `text`, `visualize`) */
	group?: string;
	params?: TypstParam[];
	/** a call with its defaults yields block-level content; `content`: as block-level as the content it is given; absent: not known */
	block?: boolean | 'content';
	/** the bool parameter that makes a call block-level when true (raw, math.equation, quote) */
	blockParam?: string;
	/** a value's text, or a call's with `{param}` where that argument's text goes; "" when it prints nothing */
	prints?: string;
	/** a value's Typst when it reads only std names (`h(12pt)`) */
	value?: string;
	/** std: the types a function returns */
	returns?: string[];
	/** names reached through it: `table.cell`, `calc.abs`, a module's names */
	scope?: Record<string, TypstEntry>;
	/** re-exported from another package, `@preview/name:version` */
	from?: string;
	/** the same as another name of this package (`let ac = acr`, `let fa-x = fa-icon.with(..)`), whose entry holds the rest */
	alias?: string;
	/** what the function a call makes prints (`thmbox("theorem", "Theorem")`), in markup: `{param}` for the call's
	 *  argument, `{.number}` its count, `{.note}` its own one positional argument, `{.body}` its content; `headKeeps`:
	 *  the named arguments a call of the maker can add without changing the head */
	makes?: { prints: string; printsNoted?: string; headKeeps?: string[] };
	/** std: draws round (`circle`, `ellipse`) */
	round?: true;
	/** std: a call prints its text in the code type (`raw`) */
	mono?: true;
	/** std: a call prints nothing at all (`metadata`, a counter update) */
	invisible?: true;
	/** an internal or a wrapper applied with `show:`, which Insert leaves out */
	hidden?: true;
	/** a call draws a picture of its own (a diagram, a canvas, a plot) that only the package's engine can show */
	picture?: true;
	/** a call names a glossary or acronym entry and prints its fields by these templates */
	glossary?: TypstGlossaryUse;
};

/** `{short}`, `{long}`, `{plural}`, `{longplural}`, `{description}` and `{key}` stand for the entry's fields, `{Short}` and
 *  the like for the same with a capital first letter. A plural an entry leaves out is its short or long form with an s */
export type TypstGlossaryUse = {
	first: string;
	next: string;
	/** the text of a use that sets the named switch to `true` */
	flags?: Record<string, string>;
};

export type TypstPackageFile = {
	version: 1;
	/** `@preview/glossarium:0.5.10`; `std` for Typst's own library */
	id: string;
	names: Record<string, TypstEntry>;
	/** names the entrypoint re-exports from other packages, all of a package's (`*`) or these; `names` wins over them */
	reexports?: Record<string, '*' | string[]>;
};

/** `@namespace/name:version` read apart */
export type TypstPackageSpec = { namespace: string; name: string; version: string };
