// the uses of packages and classes the open file writes, with the name as it stands in the text
import { samePath } from '$lib/workspace/fileSystem';
import type { DocumentPackageUse, LatexCheckInput } from '../latexChecks';

export type WrittenUse = { use: DocumentPackageUse; label: string };

/** a language selector or a library names no file where it stands, so it is left out */
export function writtenUses(input: LatexCheckInput): WrittenUse[] {
	return input.uses.flatMap((use) => {
		if (!samePath(use.path, input.path)) return [];
		const label = use.name.replace(/^class-/, '');
		return input.text.startsWith(label, use.at) ? [{ use, label }] : [];
	});
}
