import type { FileKind } from '$lib/workspace/documentBuffer.svelte';
import { offerLatexInserts } from './latexInserts';
import { offerOtherInserts } from './typstInserts';

export type InsertSource = { kind: FileKind; preamble: string | null; definitions: string; source: string };

/** what the open file offers to insert; a promise to ask again on while its packages load */
export function offerFileInserts(file: InsertSource): Promise<unknown> | null {
	if (file.kind === 'md' || file.kind === 'typ') offerOtherInserts(file.kind, file.source);
	else if (file.kind === 'tex' && file.preamble != null) return offerLatexInserts(file.preamble, file.definitions);
	return null;
}
