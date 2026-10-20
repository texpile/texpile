import type * as Ast from '@unified-latex/unified-latex-types';
import type { PackageTable } from './signatures/packageTable';

export type ParseOptions = {
	/** 'math' parses math-mode content. */
	mode?: 'regular' | 'math';

	/** the arguments the document's loaded files give; absent: texpile/ctan-base's */
	table?: PackageTable;

	/** what the document defines, over the table's entry for a command it has */
	documentMacros?: Ast.MacroInfoRecord;

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
