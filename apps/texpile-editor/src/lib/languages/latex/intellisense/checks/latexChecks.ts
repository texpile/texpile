// the seam the live LaTeX checks plug into: workspace/document/liveRefChecks.svelte.ts runs each one that is on
import type { SourceDiagnosticFix } from '$lib/editor/source/sourceEditorTypes';
import type { Engine } from '$lib/workspace/compileCommand';
import type { LoadedFile } from '../../knowledge/loadedFiles';
import type { PackageUse } from '../packages/packageUses';
import type { DefinedNames } from './reading/definedNames';
import type { OptionNames } from './reading/optionNames';
import { engineCheck } from './rules/engineCheck';
import { packageClashCheck } from './rules/packageClashCheck';
import { undefinedCommandCheck } from './rules/undefinedCommandCheck';
import { unknownOptionCheck } from './rules/unknownOptionCheck';
import type { LatexCheckId } from './checkSwitches';

/** a use of a package or class anywhere in the document; at is where its name stands in the file at path */
export type DocumentPackageUse = PackageUse & { path: string; at: number };

export type LatexCheckInput = {
	/** the open file's text */
	text: string;
	path: string;
	/** the document's main file; null when the open file belongs to none */
	main: string | null;
	isMain: boolean;
	/** the engine the folder's compile command runs; null when it names none */
	engine: Engine | null;
	/** the kernel, the class and every use with what it loads, over the whole document */
	loaded: LoadedFile[];
	/** every use in the document's files in reading order */
	uses: DocumentPackageUse[];
	/** what the document's other files define; null when a file it brings in could not be read */
	elsewhere: DefinedNames | null;
	/** the packages and classes whose .sty or .cls the folder holds, and elsewhere reads */
	local: ReadonlySet<string>;
	/** the options each loaded file takes */
	options: OptionNames;
	/** what a loaded file may load besides */
	possible: ReadonlySet<string>;
};

/** at: where in the open file the anchor starts */
export type SourceProblem = { rule: LatexCheckId; at: number; anchor: string; message: string; fix?: SourceDiagnosticFix };

export type LatexCheck = { id: LatexCheckId; run: (input: LatexCheckInput) => SourceProblem[] };

export const LATEX_CHECKS: LatexCheck[] = [undefinedCommandCheck, engineCheck, unknownOptionCheck, packageClashCheck];
