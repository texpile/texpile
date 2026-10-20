// memoized preamble scan: user-defined commands and packages the body conversion consults
import type { Node, Root } from '@unified-latex/unified-latex-types';
import type { ParseOptions } from '../types';
import { DEF_LIKE_PRIMITIVES, heuristicMarkTexPrimitiveDefs, envPairsFromDefinitions } from '../heuristics';
import { parseLatex } from '../parser';
import { definedMacrosIn, type DefinedMacro } from '../signatures/definedMacros';

type PreambleScan = {
	key: string;
	delimPairs: Map<string, string>;
	macros: DefinedMacro[];
};
let preambleScanMemo: PreambleScan | null = null;

const DEF_PROBES = [...DEF_LIKE_PRIMITIVES].map((name) => `\\${name}`);

export function scanPreambleText(preamble: string, parseOptions: ParseOptions): PreambleScan {
	if (preambleScanMemo && preambleScanMemo.key === preamble) return preambleScanMemo;
	const scan: PreambleScan = { key: preamble, delimPairs: new Map(), macros: definedMacrosIn(preamble) };
	// an env shortcut defined with newcommand rather than def; the span between the pair is
	// math either way, and reading it as prose text-escapes the maths
	envPairsFromDefinitions(scan.macros, scan.delimPairs);
	// the substring probe is a cheap trigger for the parse; extraction is AST-based
	if (DEF_PROBES.some((probe) => preamble.includes(probe))) {
		let preAst: Root | null = null;
		try {
			preAst = parseLatex(preamble, parseOptions);
		} catch {
			/* a malformed preamble must not break body parsing */
		}
		if (preAst) {
			try {
				heuristicMarkTexPrimitiveDefs(preAst.content as Node[], preamble, scan.delimPairs);
			} catch {
				/* ditto */
			}
		}
	}
	preambleScanMemo = scan;
	return scan;
}
