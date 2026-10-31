import type { FigureLanguage } from '$lib/draw/editor';

// past this many kinds the line says the rest as a count
const KINDS_SHOWN = 3;

function counted(n: number, title: string): string {
	const word = title.toLowerCase();
	return n === 1 ? `1 ${word}` : `${n} ${/(s|x|sh|ch)$/.test(word) ? `${word}es` : `${word}s`}`;
}

/** what the picture holds, as its objects list names them: `2 boxes, 1 arrow`; read without TeX or Typst */
export function figureSummary(language: FigureLanguage, text: string): string {
	const picture = language.readPicture(text, 0);
	const counts = new Map<string, number>();
	for (const st of picture?.statements ?? []) {
		if (st.kind === 'frame' || st.kind === 'scope' || st.kind === 'other') continue;
		const title = language.describe(text, st).title;
		counts.set(title, (counts.get(title) ?? 0) + 1);
	}
	const kinds = [...counts].sort((a, b) => b[1] - a[1]);
	const shown = kinds.slice(0, KINDS_SHOWN).map(([title, n]) => counted(n, title));
	const rest = kinds.slice(KINDS_SHOWN).reduce((sum, [, n]) => sum + n, 0);
	return [...shown, ...(rest ? [counted(rest, 'other shape')] : [])].join(', ');
}
