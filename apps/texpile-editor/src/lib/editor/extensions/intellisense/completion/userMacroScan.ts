// the pure buffer scan for user-defined macros (\newcommand family via the AST, plus the regex-only
// forms). runs inside userMacros.worker.ts because parseLatex over the whole file takes seconds at
// 1MB; results are plain data so they can cross the worker boundary.
import { listNewcommands } from '@unified-latex/unified-latex-util-macros';
import { parseLatex } from '$lib/latex-parser/parser';
import { MACRO_SIGNATURES, ENV_SIGNATURES } from '$lib/latex-parser/macros';

export interface UserMacroDef {
	name: string;
	signature: string;
}

export const MAX_SCAN_LENGTH = 2_000_000; // guards against parsing many megabytes per refresh

// definition forms listNewcommands doesn't cover (LW parses these in macro.ts parse())
const EXTRA_DEF_PATTERNS: Array<{ re: RegExp; sig: (m: RegExpExecArray) => string }> = [
	{ re: /\\DeclareMathOperator\*?\{\\([a-zA-Z@]+)\}/g, sig: () => '' },
	{ re: /\\DeclarePairedDelimiter(?:XPP|X)?\{?\\([a-zA-Z@]+)\}?/g, sig: () => 'm' },
	{ re: /\\(?:(?:re)?newrobustcmd|DeclareRobustCommand)\*?\{\\([a-zA-Z@]+)\}(?:\[(\d)\])?/g, sig: (m) => 'm '.repeat(+(m[2] ?? 0)).trim() }
];

/** every macro defined in this buffer, first definition wins. filtering against the static DBs
 * happens back on the main thread so the worker doesn't drag the CTAN/vendored data along. */
export function extractUserMacros(text: string): UserMacroDef[] {
	if (text.length > MAX_SCAN_LENGTH) return [];
	const seen = new Set<string>();
	const out: UserMacroDef[] = [];
	const add = (name: string, signature: string) => {
		if (seen.has(name)) return;
		seen.add(name);
		out.push({ name, signature });
	};
	try {
		const ast = parseLatex(text, { macros: MACRO_SIGNATURES, environments: ENV_SIGNATURES });
		for (const m of listNewcommands(ast)) add(m.name, m.signature);
	} catch {
		// unparseable mid-edit buffer: static + regex-scanned completions still work
	}
	for (const { re, sig } of EXTRA_DEF_PATTERNS) {
		re.lastIndex = 0;
		for (let m = re.exec(text); m; m = re.exec(text)) add(m[1], sig(m));
	}
	return out;
}
