// which names a rename may take: well-formed, and not the name of anything the document already defines
import { keysIn } from '$lib/languages/latex/knowledge/calls/roleKeys';
import { keyLabelsIn } from '$lib/languages/latex/knowledge/calls/keyLabels';
import { scanGlossary } from '$lib/languages/latex/intellisense/completion/glossary';
import { codeKeepingOpenings } from '$lib/languages/latex/texCode';
import type { CommandReadings } from '$lib/languages/latex/knowledge/calls/commandCalls';
import type { LoadedFile } from '$lib/languages/latex/knowledge/loadedFiles';
import { m } from '$lib/paraglide/messages';
import type { UseKind } from './renameUses';

export type RenameNameProblem = 'empty' | 'invalid';

// a citation key also stops at the characters of a BibTeX field value
const CHARS_NOT_IN_NAME: Record<UseKind, string> = { cite: '"#%\'(),={}\\', label: '\\#%{},', glossary: '\\#%{},' };

/** the characters a new name may not hold, besides whitespace, as the dialog lists them */
export function renameNameChars(kind: UseKind): string {
	return [...CHARS_NOT_IN_NAME[kind]].join(' ');
}

export function renameNameProblem(kind: UseKind, name: string): RenameNameProblem | null {
	if (!name.trim()) return 'empty';
	return name.split('').some((c) => /\s/.test(c) || CHARS_NOT_IN_NAME[kind].includes(c)) ? 'invalid' : null;
}

/** what to tell the person about a new name that cannot be used, or null when it can */
export function renameProblemText(kind: UseKind, name: string): string | null {
	const problem = renameNameProblem(kind, name);
	if (!problem) return null;
	if (problem === 'empty') return m.rename_symbol_empty();
	const characters = renameNameChars(kind);
	return kind === 'cite' ? m.rename_symbol_invalid_citekey({ characters }) : m.rename_symbol_invalid_label({ characters });
}

const BIB_ENTRY_KEY = /^\s*@[A-Za-z]+\s*[{(]\s*([^\s,{}]+)\s*,/gm;

/** the names the files define for `kind`: LaTeX text by its calls (and the document's own wrappers of them), a .bib by its entry lines */
export function definedNamesIn(
	kind: UseKind,
	files: readonly { path: string; text: string }[],
	loaded: LoadedFile[],
	wrappers: CommandReadings = {}
): Set<string> {
	const names = new Set<string>();
	for (const { path, text } of files) {
		if (/\.bib$/i.test(path)) {
			if (kind === 'cite') for (const m of text.matchAll(BIB_ENTRY_KEY)) names.add(m[1]);
			continue;
		}
		const code = codeKeepingOpenings(text);
		if (kind === 'label') {
			for (const d of keysIn(code, 'label', true, wrappers)) names.add(d.key);
			for (const key of keyLabelsIn(code, loaded)) names.add(key);
		} else if (kind === 'cite') {
			for (const d of keysIn(code, 'citekey', true, wrappers)) names.add(d.key);
		} else {
			for (const g of scanGlossary(code, loaded)) names.add(g.key);
		}
	}
	return names;
}
