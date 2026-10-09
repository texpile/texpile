export type SnippetLanguage = 'latex' | 'typst' | 'markdown';

export const SNIPPET_LANGUAGES: readonly SnippetLanguage[] = ['latex', 'typst', 'markdown'];

/** where a trigger works; `math` covers inline and display, `code` is Typst only */
export type SnippetContext = 'math' | 'inline-math' | 'display-math' | 'text' | 'code' | 'any';

/** later layers replace earlier ones by snippet name */
export type SnippetLayer = 'builtin' | 'global' | 'project';

export type Snippet = {
	name: string;
	layer: SnippetLayer;
	prefixes: string[];
	/** VS Code snippet syntax, per language it applies to */
	bodies: Partial<Record<SnippetLanguage, string>>;
	description: string;
	context: SnippetContext;
	auto: boolean;
	/** absent: the language's default (on for Typst auto snippets) */
	word?: boolean;
	regex: boolean;
	flags: string;
	priority: number;
	/** CodeMirror key syntax, e.g. Mod-Shift-o */
	key?: string;
	/** a function name: the snippet wraps the selection in a call to it */
	wrap?: string;
	args?: string;
};

export type SnippetVariables = Record<string, Partial<Record<SnippetLanguage, string>>>;

export type SnippetProblem = { layer: SnippetLayer; name: string; reason: string };

export type SnippetFile = {
	snippets: Snippet[];
	/** names the file turns off in earlier layers */
	disabled: string[];
	variables: SnippetVariables;
	problems: SnippetProblem[];
};
