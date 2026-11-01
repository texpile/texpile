import type { FigureLanguage } from '$lib/draw/editor';
import { kindCount } from '$lib/draw/editor/figure/statementKinds';
import { m } from '$lib/paraglide/messages';

const KINDS_SHOWN = 3;

export function figureSummary(language: FigureLanguage, text: string): string {
	const picture = language.readPicture(text, 0);
	const counts = new Map<string, number>();
	for (const st of picture?.statements ?? []) {
		if (st.kind === 'frame' || st.kind === 'scope' || st.kind === 'other') continue;
		const kind = language.describe(text, st).kind;
		counts.set(kind, (counts.get(kind) ?? 0) + 1);
	}
	const kinds = [...counts].sort((a, b) => b[1] - a[1]);
	const shown = kinds.slice(0, KINDS_SHOWN).map(([kind, n]) => kindCount(kind, n));
	const rest = kinds.slice(KINDS_SHOWN).reduce((sum, [, n]) => sum + n, 0);
	return [...shown, ...(rest ? [kindCount('other-shape', rest)] : [])].join(m.figure_count_separator());
}
