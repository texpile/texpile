import type { TypstSymbolCategory } from './typstSymbolTable';

/** the picker's tabs: tinymist's categories folded into a row that fits, and the emoji module */
export type TypstSymbolGroup =
	'greek' | 'operators' | 'relations' | 'arrows' | 'delimiters' | 'punctuation' | 'shapes' | 'other' | 'spaces' | 'emoji';

export type TypstSymbol = {
	/** the full name again, as the picker keys every language's symbols */
	id: string;
	/** the full name, `sym.arrow.r.double` */
	name: string;
	/** the name without its module, `arrow.r.double`: how math mode writes it */
	path: string;
	module: 'sym' | 'emoji';
	/** the character, or characters, it stands for */
	value: string;
	category: TypstSymbolCategory;
	group: TypstSymbolGroup;
	/** Unicode's name for the character, lower case; '' for a sequence such as a flag */
	unicodeName: string;
	mathShorthand: string | null;
	markupShorthand: string | null;
	/** a space, joiner or direction mark: there is nothing to see of it in the source */
	invisible: boolean;
};

/** where the caret is, which decides how a symbol is written there */
export type TypstInsertContext = 'math' | 'markup' | 'code' | 'text';

/** what goes in: text as written, or Typst code, which the visual editor holds as a code chip */
export type TypstSymbolInsertion = { text: string; kind: 'text' | 'code' };
