/* eslint no-param-reassign: "off" -- StreamLanguage hands each token a mutable state; mutating it is the API */
// Hand-written LaTeX StreamLanguage, replacing legacy-modes' stex (which language-data's "LaTeX"
// descriptor loads). stex files almost everything under `tag`, a tag our shared highlight style -
// and CodeMirror's default one - does not colour at all, so a .tex buffer was painted nearly flat
// while .typ and .md got full colour. This tokenizer emits the SAME tag vocabulary the Typst wasm
// parser and lang-markdown use, so one construct gets one colour in every dialect:
//
//     \section{..} = = Heading / # Heading      -> heading
//     \textbf, \frac (any command) = #strong    -> function(variableName)
//     $..$ content = typst math                 -> special(string) / special(variableName)
//     \label/\ref/\cite keys = <lbl>/@ref       -> labelName
//     \usepackage/\input = #import/#include     -> moduleKeyword
//     verbatim/lstlisting = ```raw```           -> monospace
//     \begin/\end                               -> keyword, env name -> className
//
// A stream tokenizer, not a Lezer grammar, on purpose: TeX is not context-free (catcodes), and
// everything here that would consume a syntax tree - folding, completions, the math-context
// detector, the visual editor's parse - is already custom and independent of this mode. All this
// has to do is colour tokens, which line-local state does fine.
import { StreamLanguage, LanguageSupport } from '@codemirror/language';
import { closeBrackets, closeBracketsKeymap } from '@codemirror/autocomplete';
import { keymap } from '@codemirror/view';
import { latexEscapedBrackets } from './latexEscapedBrackets';
import { latexQuotePair } from './latexQuotePair';
import { tags } from '@lezer/highlight';

// starred variants share the base name; matched with the * already stripped
const MATH_ENVS = new Set(['equation', 'align', 'alignat', 'gather', 'multline', 'flalign', 'eqnarray', 'math', 'displaymath']);
const VERBATIM_ENVS = new Set(['verbatim', 'Verbatim', 'lstlisting', 'minted', 'alltt', 'filecontents']);

const HEADING_CMD = /^\\(?:part|chapter|section|subsection|subsubsection|paragraph|subparagraph)\*?(?=\s*[[{])/;
const MODULE_CMD =
	/^\\(?:documentclass|usepackage|RequirePackage|input|include|includeonly|bibliography|addbibresource|bibliographystyle)\b/;
const LABEL_CMD = /^\\(?:label|ref|eqref|pageref|autoref|nameref|[cCv]ref|[a-zA-Z]*cite[a-zA-Z]*)\*?(?=\s*[[{])/;
const URL_CMD = /^\\(?:url|href)(?=\s*\{)/;

type LatexState = {
	/** how the current math region closes: '$', '$$', ')', ']' or 'env:<name>'; null in text */
	math: string | null;
	/** verbatim environment we are inside, ended only by its own \end{...} */
	verbatim: string | null;
	/** set while consuming \begin{verbatim}'s argument; becomes `verbatim` at the closing brace */
	startVerbatim: string | null;
	/** the token name for the current braced argument's content ('heading' | 'labelName' | 'url' | 'env') */
	argTag: string | null;
	/** brace depth inside that argument; 0 = not in one */
	argDepth: number;
	/** argTag to activate at the next '{' (survives an [..] options group in between) */
	pendingArg: string | null;
	/** the next {name} names an environment, and whether it opens or closes one */
	pendingEnv: 'begin' | 'end' | null;
};

/** environment-name argument consumed: flip math/verbatim state to match. */
function enterEnv(state: LatexState, name: string) {
	const base = name.replace(/\*$/, '');
	if (state.pendingEnv === 'begin') {
		if (MATH_ENVS.has(base) && !state.math) state.math = `env:${name}`;
		// verbatim starts after the closing brace, not at the name, so \begin{verbatim} stays tokens
		else if (VERBATIM_ENVS.has(base)) state.startVerbatim = name;
	} else if (state.pendingEnv === 'end' && state.math === `env:${name}`) {
		state.math = null;
	}
}

export const latexLanguage = StreamLanguage.define<LatexState>({
	name: 'latex',
	// the pairs and the before-set are LaTeX Workshop's; `$` deliberately not among them there or
	// here: \$ for currency and $$ display math both fight a same-character auto-close
	languageData: {
		commentTokens: { line: '%' },
		closeBrackets: { brackets: ['(', '[', '{'], before: ';:.,={}])>\\` \t$' }
	},

	startState: () => ({ math: null, verbatim: null, startVerbatim: null, argTag: null, argDepth: 0, pendingArg: null, pendingEnv: null }),

	token(stream, state) {
		// verbatim swallows everything up to its own \end{...}; the \end itself parses normally
		if (state.verbatim) {
			const end = `\\end{${state.verbatim}}`;
			const idx = stream.string.indexOf(end, stream.pos);
			if (idx === stream.pos) state.verbatim = null;
			else if (idx === -1) {
				stream.skipToEnd();
				return 'monospace';
			} else {
				while (stream.pos < idx) stream.next();
				return 'monospace';
			}
		}

		if (stream.eatSpace()) return null;

		if (stream.peek() === '\\') {
			if (stream.match('\\\\')) return 'linebreak';
			if (stream.match(/^\\[%&#_{}$~^ ]/)) return 'escape';
			if (stream.match(/^\\[([]/)) {
				if (!state.math) {
					state.math = stream.current().endsWith('(') ? ')' : ']';
					return 'mathDelim';
				}
				return 'mathCommand';
			}
			if (stream.match(/^\\[)\]]/)) {
				if (state.math === stream.current()[1]) {
					state.math = null;
					return 'mathDelim';
				}
				return state.math ? 'mathCommand' : 'command';
			}
			if (stream.match(/^\\(?:begin|end)(?=\s*\{)/)) {
				state.pendingEnv = stream.current() === '\\begin' ? 'begin' : 'end';
				return 'keyword';
			}
			// \label inside an equation is routine, so the label family is not text-only
			if (stream.match(LABEL_CMD)) {
				state.pendingArg = 'labelName';
				return state.math ? 'mathCommand' : 'command';
			}
			if (!state.math) {
				if (stream.match(HEADING_CMD)) {
					// the MACRO colours like any command; only the argument text is 'heading'
					// (bold, default colour) - the title is document text, not syntax
					state.pendingArg = 'heading';
					return 'command';
				}
				if (stream.match(URL_CMD)) {
					state.pendingArg = 'url';
					return 'command';
				}
				if (stream.match(MODULE_CMD)) return 'module';
				if (stream.match(/^\\item\b/)) return 'list';
			}
			if (stream.match(/^\\(?:[a-zA-Z@]+\*?|.)/)) return state.math ? 'mathCommand' : 'command';
			stream.next();
			return null;
		}

		if (stream.peek() === '%') {
			stream.skipToEnd();
			return 'comment';
		}

		const ch = stream.peek();
		if (ch === '{') {
			stream.next();
			if (state.argDepth > 0) state.argDepth++;
			else if (state.pendingEnv) {
				state.argTag = 'env';
				state.argDepth = 1;
			} else if (state.pendingArg) {
				state.argTag = state.pendingArg;
				state.pendingArg = null;
				state.argDepth = 1;
			}
			return 'brace';
		}
		if (ch === '}') {
			stream.next();
			if (state.argDepth > 0 && --state.argDepth === 0) {
				state.argTag = null;
				state.pendingEnv = null;
				if (state.startVerbatim) {
					state.verbatim = state.startVerbatim;
					state.startVerbatim = null;
				}
			}
			return 'brace';
		}

		// argument content, checked before math so \label{eq:x} keys read as labels there too
		if (state.argDepth > 0 && state.argTag && stream.match(/^[^\\{}%$]+/)) {
			if (state.argTag === 'env') {
				enterEnv(state, stream.current().trim());
				return 'envName';
			}
			return state.argTag;
		}

		if (state.math) {
			if (ch === '$') {
				stream.next();
				if (state.math === '$$' && stream.eat('$')) {
					state.math = null;
					return 'mathDelim';
				}
				if (state.math === '$') {
					state.math = null;
					return 'mathDelim';
				}
				return 'mathText';
			}
			if (ch === '&') {
				stream.next();
				return 'operator';
			}
			if (!stream.match(/^[^\\${}%&]+/)) stream.next();
			return 'mathText';
		}

		if (ch === '$') {
			stream.next();
			state.math = stream.eat('$') ? '$$' : '$';
			return 'mathDelim';
		}
		if (ch === '[' || ch === ']') {
			stream.next();
			return 'bracket';
		}
		if (ch === '&') {
			stream.next();
			return 'operator';
		}
		if (ch === '~') {
			stream.next();
			return 'escape';
		}

		if (!stream.match(/^[^\\{}$%&[\]~]+/)) stream.next();
		// prose ran between a command and any brace: the pending argument is not coming
		state.pendingArg = null;
		return null;
	},

	// custom token names that map to tags string lookup can't (or must not) reach; the plain
	// names (comment, keyword, heading, labelName, url, escape, brace, bracket, operator,
	// monospace) resolve through tags[name] on their own
	tokenTable: {
		command: tags.function(tags.variableName),
		module: tags.moduleKeyword,
		envName: tags.className,
		mathDelim: tags.controlKeyword,
		mathText: tags.special(tags.string),
		mathCommand: tags.special(tags.variableName),
		linebreak: tags.contentSeparator,
		// the marker tag, NOT tags.list: the theme colours markers, and leaves tags.list alone
		// because md's list rule spans whole list subtrees (see cmHighlight)
		list: tags.processingInstruction
	}
});

export function latex(): LanguageSupport {
	return new LanguageSupport(latexLanguage, [latexEscapedBrackets(), latexQuotePair(), closeBrackets(), keymap.of(closeBracketsKeymap)]);
}
