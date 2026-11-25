// the entries of a .bib file and where each starts
import { parseBibtexTokens } from '$lib/languages/bib/biblatex';
import type { KeyAt } from './fileReferences';

export function bibEntriesIn(text: string): KeyAt[] {
	let tokens;
	try {
		tokens = parseBibtexTokens(text);
	} catch {
		return [];
	}
	const out: KeyAt[] = [];
	let pos = 0;
	for (const t of tokens) {
		pos += t.pre?.length ?? 0;
		const body = t.kind === 'entry' ? t.raw : t.text;
		if (t.kind === 'entry' && t.entry.citationKey) out.push({ key: t.entry.citationKey, at: text.startsWith(body, pos) ? pos : -1 });
		pos += body.length;
	}
	return out;
}
