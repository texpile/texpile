// LaTeX's contribution to the move-aware reference updater: find every file-path argument via
// the AST (never regex) and report its exact span. Matching, extension-style preservation and
// the splice are shared - see workspace/fileRefs.ts, which dispatches here by file extension.
import { parseLatex } from './parser';
import { findAll } from './ast-utils';
import { printRaw } from '@unified-latex/unified-latex-util-print-raw';
import type { Macro } from '@unified-latex/unified-latex-types';
import type { FileRef } from '$lib/workspace/fileRefs';

// explicit signatures so the mandatory {path} arg always attaches (some of these live in CTAN
// packages the bundled DB doesn't include, e.g. graphicx).
const FILEREF_PARSE_OPTS = {
	documentMacros: {
		includegraphics: { signature: 'o m' },
		includesvg: { signature: 'o m' },
		includepdf: { signature: 'o m' },
		input: { signature: 'm' },
		include: { signature: 'm' },
		subfile: { signature: 'm' },
		bibliography: { signature: 'm' },
		addbibresource: { signature: 'o m' },
		lstinputlisting: { signature: 'o m' },
		verbatiminput: { signature: 'm' }
	}
};
const FILE_COMMANDS = new Set(Object.keys(FILEREF_PARSE_OPTS.documentMacros));

/** Every file-path argument in `latex`, with the span holding the path itself. */
export function collectLatexFileRefs(latex: string): FileRef[] {
	const ast = parseLatex(latex, FILEREF_PARSE_OPTS);
	const out: FileRef[] = [];
	function offset(n: unknown, end = false) {
		const p = (n as { position?: { start?: { offset?: number }; end?: { offset?: number } } }).position;
		return (end ? p?.end?.offset : p?.start?.offset) ?? null;
	}
	for (const node of findAll(ast, (n) => (n as Macro).type === 'macro' && FILE_COMMANDS.has((n as Macro).content ?? ''))) {
		const arg = ((node as Macro).args ?? []).filter((a) => a.openMark === '{').pop(); // the mandatory {path}
		const content = arg?.content;
		if (!content?.length) continue;
		const innerStart = offset(content[0]);
		const innerEnd = offset(content[content.length - 1], true);
		if (innerStart == null || innerEnd == null) continue;
		out.push({ innerStart, innerEnd, current: printRaw(content).trim() });
	}
	return out;
}
