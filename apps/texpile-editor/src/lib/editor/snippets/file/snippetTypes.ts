export type SnippetLanguage = 'latex' | 'typst' | 'markdown';

export const SNIPPET_LANGUAGES: readonly SnippetLanguage[] = ['latex', 'typst', 'markdown'];

/** where a trigger works; `math` covers inline and display, `code` is Typst only */
export type SnippetContext = 'math' | 'inline-math' | 'display-math' | 'text' | 'code' | 'any';

/** later layers replace earlier ones by snippet name */
export type SnippetLayer = 'builtin' | 'global' | 'project';

export const CALL_COLORS = ['red', 'orange', 'yellow', 'green', 'blue', 'purple', 'gray'] as const;
export type CallColor = (typeof CALL_COLORS)[number];

export const CALL_FONTS = ['bold', 'italic', 'smallcaps', 'underline', 'strike'] as const;
export type CallFont = (typeof CALL_FONTS)[number];

/** how the visual editor draws a call to a wrap snippet's function; without one the call stays a raw chip */
export type CallLook = {
	/** inline: the words in line with a style; box: framed, for notes */
	look: 'inline' | 'box';
	label: string;
	color?: CallColor;
	background?: CallColor;
	font: CallFont[];
	spellcheck: boolean;
};

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
	visual?: CallLook;
};

export type SnippetVariables = Record<string, Partial<Record<SnippetLanguage, string>>>;

/** `file` names the file when it is not the layer's snippet file */
export type SnippetProblem = { layer: SnippetLayer; name: string; reason: string; file?: string };

export type SnippetFile = {
	snippets: Snippet[];
	/** names the file turns off in earlier layers */
	disabled: string[];
	variables: SnippetVariables;
	problems: SnippetProblem[];
};
