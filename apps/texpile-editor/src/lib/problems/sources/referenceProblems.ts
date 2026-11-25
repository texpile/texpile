// the document's reference findings as rows
import { refProblemText } from '$lib/workspace/document/liveRefDiagnostics';
import { m } from '$lib/paraglide/messages';
import { ignoreKeyOf } from '../ignoredProblems';
import { lineAt, lineText, linesOf, type TextLines } from '../textLines';
import type { ReferenceFinding } from '../checks/documentReferences';
import type { Problem } from '../problemTypes';

function messageOf(f: ReferenceFinding): string {
	switch (f.kind) {
		case 'label-twice':
			return refProblemText({ kind: 'label-twice', name: f.name, at: f.at, elsewhere: f.elsewhere ?? null });
		case 'cite-unknown':
			return refProblemText({ kind: 'cite-unknown', name: f.name, at: f.at });
		case 'ref-undefined':
			return m.problems_ref_undefined({ name: f.name });
		case 'entry-uncited':
			return m.problems_entry_uncited({ name: f.name });
		case 'float-unreferenced':
			return m.problems_float_unreferenced({ name: f.name });
	}
}

/** texts: each file's text by path, for the line numbers */
export function referenceProblems(findings: ReferenceFinding[], texts: ReadonlyMap<string, string>): Problem[] {
	const lines = new Map<string, TextLines>();
	return findings.map((f): Problem => {
		const text = texts.get(f.file) ?? '';
		let starts = lines.get(f.file);
		if (!starts) lines.set(f.file, (starts = linesOf(text)));
		const line = f.at >= 0 ? lineAt(starts, f.at) : null;
		return {
			filter: 'reference',
			file: f.file,
			line,
			message: messageOf(f),
			words: f.at >= 0 ? f.name : undefined,
			ignoreKey: ignoreKeyOf('reference', f.file, f.kind, f.name, line ? lineText(starts, line) : '')
		};
	});
}
