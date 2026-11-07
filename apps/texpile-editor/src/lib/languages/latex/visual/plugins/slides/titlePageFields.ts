import type { Argument } from '$lib/languages/latex/knowledge/types';
import { mandatoryArgs, readableText, textUnitsWith } from '$lib/languages/latex/visual/core';
export const TITLE_PAGE_PARTS = ['title', 'subtitle', 'author', 'institute', 'date'] as const;
export type TitlePagePart = (typeof TITLE_PAGE_PARTS)[number];
export type TitlePageFields = Record<TitlePagePart, string>;

// beamer reads the short form in brackets first
const SIGNATURE: Argument[] = [{ kind: 'o' }, { kind: 'm' }];

function readable(source: string, today: string): string {
	return readableText(
		source
			.replace(/(^|[^\\])%.*$/gm, '$1')
			.replace(/\\(?:inst|thanks|footnote)\s*\{[^}]*\}/g, '')
			.replace(/\\today(?![a-zA-Z])/g, today)
			.replace(/\\and(?![a-zA-Z])/g, ', ')
			.replace(/\\\\(?:\[[^\]]*\])?/g, '\n')
	);
}

export function titlePageFields(preamble: string, today = new Date().toLocaleDateString()): TitlePageFields {
	const fields: TitlePageFields = { title: '', subtitle: '', author: '', institute: '', date: '' };
	const units = textUnitsWith(preamble, (name) => ((TITLE_PAGE_PARTS as readonly string[]).includes(name) ? SIGNATURE : undefined));
	for (const { call } of units) {
		const part = call?.name as TitlePagePart | undefined;
		if (!call || !part || !TITLE_PAGE_PARTS.includes(part) || fields[part]) continue;
		const text = mandatoryArgs(call)[0]?.body;
		if (text) fields[part] = readable(preamble.slice(text.from, text.to), today);
	}
	return fields;
}
