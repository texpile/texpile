import { commonCommand } from '$lib/languages/latex/knowledge/calls/commandCalls';

export type CitedWork = { author?: string; year?: string; unresolved?: string };

// a text citation (\citet, \textcite) puts the author in the sentence and brackets only the year
export function citationText(variant: string, works: CitedWork[], prenote: string, postnote: string): string {
	// an unresolved key falls back to the parenthetical form, which is the one that can show it
	if (commonCommand(variant)?.cite === 'text' && works.length > 0 && works.every((w) => w.unresolved == null)) {
		const body = works.map((w) => `${w.author} (${[w.year, postnote].filter(Boolean).join(', ')})`).join('; ');
		return prenote ? `${prenote} ${body}` : body;
	}
	const body = works.map((w) => w.unresolved ?? `${w.author} ${w.year}`).join('; ');
	return `(${[prenote, body, postnote].filter(Boolean).join(', ')})`;
}
