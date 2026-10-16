import type * as Ast from '@unified-latex/unified-latex-types';

export type ParseOptions = {
	/** 'math' parses math-mode content. */
	mode?: 'regular' | 'math';

	/** macro name (no backslash) to argument signature. */
	macros?: Ast.MacroInfoRecord;

	environments?: Ast.EnvInfoRecord;

	/** what the document and its packages define, over the table's own entry for a command it has */
	documentMacros?: Ast.MacroInfoRecord;

	/** the document loads beamer, whose overlay arguments (\item<2>) apply only there */
	beamer?: boolean;

	flags?: {
		/** parse @ as a letter, as if \makeatletter is set. */
		atLetter?: boolean;

		/** parse _ and : as letters, as if \ExplSyntaxOn is set. */
		expl3?: boolean;

		/** autodetect macros that look like they need @, _, or :. */
		autodetectExpl3AndAtLetter?: boolean;
	};
};

export type LatexAst = Ast.Root;

export type LatexNode = Ast.Node;

export type MathNode = Ast.InlineMath | Ast.DisplayMath;

export type EnvironmentNode = Ast.Environment;

export type MacroNode = Ast.Macro;
