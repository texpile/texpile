import { commonCommand, rolesOf } from '../calls/commandCalls';
import { commonEnvFacts } from '../environments/envFacts';

export type GlossaryEntryText = { acronym: boolean; short: string; long: string; description: string };

type Form = 'first' | 'short' | 'long' | 'full' | 'text' | 'name' | 'description';

const FORMS: Record<string, Form> = {
	ac: 'first',
	acp: 'first',
	acs: 'short',
	acsp: 'short',
	acl: 'long',
	aclp: 'long',
	acf: 'full',
	acfp: 'full',
	acrshort: 'short',
	acrshortpl: 'short',
	acrlong: 'long',
	acrlongpl: 'long',
	acrfull: 'full',
	acrfullpl: 'full',
	gls: 'first',
	glspl: 'first',
	glstext: 'text',
	glstextpl: 'text',
	glsfirst: 'first',
	glsname: 'name',
	glsdesc: 'description'
};

export type GlossaryUse = { form: Form; plural: boolean; capital: 'none' | 'first' | 'all'; entryArg: number };

export function glossaryUse(command: string): GlossaryUse | null {
	const args = commonCommand(command)?.args;
	const mandatory = args?.filter((a) => a.kind === 'm') ?? [];
	if (!args || mandatory.length !== 1 || mandatory[0].defines !== undefined) return null;
	const roles = rolesOf(mandatory[0]);
	if (!roles.includes('acronym') && !roles.includes('glossary')) return null;
	const lower = command.toLowerCase();
	const base = lower.replace(/pl$/, '');
	const plural = lower !== base || /^ac[a-z]p$|^acp$/.test(lower);
	const form = FORMS[lower] ?? FORMS[base] ?? 'first';
	const capital = command === command.toUpperCase() ? 'all' : command[0] === command[0].toUpperCase() ? 'first' : 'none';
	return { form, plural, capital, entryArg: args.indexOf(mandatory[0]) };
}

function pluralOf(text: string): string {
	return text + 's';
}

export function glossaryText(use: GlossaryUse, entry: GlossaryEntryText): string {
	const short = entry.short;
	const long = entry.long || entry.description;
	let text: string;
	if (!entry.acronym) text = use.form === 'description' ? entry.description : entry.short;
	else if (use.form === 'long') text = use.plural ? pluralOf(long) : long;
	else if (use.form === 'full') text = `${long} (${use.plural ? pluralOf(short) : short})`;
	else text = use.plural ? pluralOf(short) : short;
	if (use.capital === 'all') return text.toUpperCase();
	return use.capital === 'first' ? text.charAt(0).toUpperCase() + text.slice(1) : text;
}

export function definesGlossaryEntries(environment: string): boolean {
	return (commonEnvFacts(environment).item ?? []).some((item) =>
		commonCommand(item)?.args.some((a) => a.defines !== undefined && rolesOf(a).some((r) => r === 'acronym' || r === 'glossary'))
	);
}
