import { commonFacts } from '$lib/languages/latex/knowledge/commands/commandFacts';
import type { LoadedFile } from '$lib/languages/latex/knowledge/loadedFiles';
import { stackedCommands } from '$lib/languages/latex/knowledge/stackedEntries';
import { codeOnly } from '$lib/languages/latex/texCode';
import { definedIn } from '$lib/languages/latex/userDefinitions';

function plainText(latex: string): string {
	return latex
		.replace(/\\[a-zA-Z@]+\*?\s*/g, '')
		.replace(/[{}]/g, '')
		.trim();
}

/** what the class prints above the entries: \bibname where it has chapters, else \refname; the preamble's own wording wins */
export function bibliographyName(preamble: string, loaded?: LoadedFile[]): string {
	const commands = loaded ? stackedCommands(loaded) : null;
	const name = commands?.has('chapter') ? 'bibname' : 'refname';
	const own = definedIn(codeOnly(preamble), 'macro')
		.filter((d) => d.name === name && d.body !== undefined)
		.pop();
	if (own) return plainText(own.body ?? '');
	return String((commands?.get(name)?.value ?? commonFacts(name).value) || '');
}
