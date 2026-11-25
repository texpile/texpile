import { callsIn, rolesOf } from '../../knowledge/calls/commandCalls';
import { keyValuesIn } from '../../knowledge/calls/keyLabels';
import { loadedReadings } from '../../knowledge/calls/loadedReadings';
import type { LoadedFile } from '../../knowledge/loadedFiles';
import type { Role } from '../../knowledge/types';
import { exceedsTextLimit } from '$lib/files/service/textLimit';

export type GlossEntry = {
	key: string;
	description: string;
	acronym: boolean;
	/** 1-based definition line, for the cross-file project scan and go-to-definition */
	line: number;
	short: string;
	long: string;
};

// acro names its entries with the acronym role alone
export const GLOSSARY_ROLES: Role[] = ['glossary', 'acronym'];

/** the entries `text` defines with the loaded glossary packages' definers; also feeds the cross-file project scan. */
export function scanGlossary(text: string, loaded: LoadedFile[]): GlossEntry[] {
	if (exceedsTextLimit(text)) return [];
	const entries: GlossEntry[] = [];
	function lineOf(i: number): number {
		return text.slice(0, i).split('\n').length;
	}
	for (const call of callsIn(text, GLOSSARY_ROLES, loadedReadings(loaded, GLOSSARY_ROLES))) {
		const named = call.args.find((a) => a.arg.defines && rolesOf(a.arg).some((r) => GLOSSARY_ROLES.includes(r)));
		if (!named) continue;
		const later = call.args.filter((a) => a.index > named.index && a.arg.kind === 'm');
		const acronym = rolesOf(named.arg).includes('acronym');
		const described = acronym ? later.at(-1) : later.find((a) => a.arg.placeholder === 'description');
		const said = described ? text.slice(described.from, described.to) : null;
		// acro's properties: short=CPU, long=central processing unit
		const description =
			(said !== null ? (acronym ? (keyValuesIn(said, new Set(['long']))[0] ?? said) : said) : null) ??
			later.flatMap((a) => keyValuesIn(text.slice(a.from, a.to), new Set(['description'])))[0] ??
			'';
		function sliced(a: { from: number; to: number }): string {
			return text.slice(a.from, a.to).trim();
		}
		function properties(name: string): string | undefined {
			return later.flatMap((a) => keyValuesIn(text.slice(a.from, a.to), new Set([name])))[0];
		}
		const bracketed = call.args.find((a) => a.index > named.index && a.arg.kind === 'o');
		for (const v of named.values) {
			const short = acronym
				? (properties('short') ?? (bracketed ? sliced(bracketed) : later.length > 1 ? sliced(later[0]) : v.value))
				: (properties('text') ?? properties('name') ?? v.value);
			const long = acronym ? (properties('long') ?? (later.length ? sliced(later[later.length - 1]) : '')) : '';
			entries.push({ key: v.value, description: description.trim(), acronym, line: lineOf(call.at), short, long });
		}
	}
	return entries;
}
