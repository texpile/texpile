export type SnippetLanguage = 'latex' | 'typst' | 'markdown';

export const SNIPPET_LANGUAGES: readonly SnippetLanguage[] = ['latex', 'typst', 'markdown'];

/** `math` covers inline and display; `code` is Typst only */
export type SnippetContext = 'math' | 'inline-math' | 'display-math' | 'text' | 'code' | 'any';

/** later layers replace earlier ones by snippet name */
export type SnippetLayer = 'builtin' | 'global' | 'project';

export type Snippet = {
	name: string;
	layer: SnippetLayer;
	prefixes: string[];
	/** VS Code snippet syntax */
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
};

export type SnippetVariables = Record<string, Partial<Record<SnippetLanguage, string>>>;

/** `file` names the file when it is not the layer's snippet file */
/** `whole`: the file did not load at all; `kept`: so its last version that loaded is still in use; `warning`: it loaded, but check it */
export type SnippetProblem = {
	layer: SnippetLayer;
	name: string;
	reason: string;
	file?: string;
	whole?: boolean;
	kept?: boolean;
	warning?: boolean;
};

export type SnippetFile = {
	snippets: Snippet[];
	/** names the file turns off in earlier layers */
	disabled: string[];
	variables: SnippetVariables;
	problems: SnippetProblem[];
};
