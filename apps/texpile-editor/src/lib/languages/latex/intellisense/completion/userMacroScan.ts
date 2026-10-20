// the pure buffer scan for user-defined macros, run in userMacros.worker.ts; results are plain data so they can cross
// the worker boundary
import { codeOnly } from '$lib/languages/latex/texCode';
import { definedIn, groupAt, primitiveDefsIn, signatureOf } from '$lib/languages/latex/userDefinitions';

/** body: the replacement text, kept only where it carries math delimiters */
export type UserMacroDef = {
	name: string;
	signature: string;
	body?: string;
};

/** begin and end: the code the environment runs, kept only where it carries math delimiters */
export type UserEnvironmentDef = {
	name: string;
	signature: string;
	begin?: string;
	end?: string;
};

export type UserDefinitions = { macros: UserMacroDef[]; environments: UserEnvironmentDef[] };

export const MAX_SCAN_LENGTH = 2_000_000; // guards against scanning many megabytes per refresh

const MATH_MARK = /\$|\\[()[\]]|\\(?:begin|end)(?![A-Za-z])/;
const MAX_PASSES = 4;
const CONTROL_WORD = /\\([A-Za-z@]+)/g;

/** the names whose text carries math delimiters, or uses a command that does */
export function mathBearingNames(entries: { name: string; text: string }[]): Set<string> {
	const bearing = new Set<string>();
	for (let pass = 0; pass < MAX_PASSES; pass++) {
		const before = bearing.size;
		for (const { name, text } of entries) {
			if (bearing.has(name)) continue;
			if (MATH_MARK.test(text) || [...text.matchAll(CONTROL_WORD)].some((m) => bearing.has(m[1]))) bearing.add(name);
		}
		if (bearing.size === before) break;
	}
	return bearing;
}

type MacroEntry = { at: number; name: string; signature: string; defines: string; body?: string };

/** every macro and environment defined in this buffer, a later definition replacing an earlier and \providecommand keeping it. filtering
 * against the static DBs happens back on the main thread so the worker doesn't drag the CTAN/vendored data along. */
export function extractUserDefinitions(text: string): UserDefinitions {
	if (text.length > MAX_SCAN_LENGTH) return { macros: [], environments: [] };
	const code = codeOnly(text);
	const entries: MacroEntry[] = [
		...definedIn(code, 'macro').map((d) => ({ at: d.at, name: d.name, signature: signatureOf(d.args), defines: d.defines, body: d.body })),
		// a \def with delimited parameters (#1.) has no known arguments
		...primitiveDefsIn(code)
			.filter((d) => d.params !== null)
			.map((d) => ({
				at: d.at,
				name: d.name,
				signature: Array.from({ length: d.params ?? 0 }, () => 'm').join(' '),
				defines: 'replace',
				body: d.bodyAt === null ? undefined : (groupAt(code, d.bodyAt) ?? undefined)
			}))
	].sort((a, b) => a.at - b.at);
	const found = new Map<string, MacroEntry>();
	for (const d of entries) if (d.defines !== 'provide' || !found.has(d.name)) found.set(d.name, d);
	const environments = definedIn(code, 'environment');
	const bearing = mathBearingNames([
		...[...found.values()].flatMap((d) => (d.body === undefined ? [] : [{ name: d.name, text: d.body }])),
		...environments.flatMap((d) => (d.body === undefined ? [] : [{ name: d.name, text: `${d.body}${d.end ?? ''}` }]))
	]);
	return {
		macros: [...found.values()].map(({ name, signature, body }) => ({
			name,
			signature,
			...(body !== undefined && bearing.has(name) ? { body } : {})
		})),
		environments: environments.map((d) => ({
			name: d.name,
			signature: signatureOf(d.args),
			...(d.body !== undefined && bearing.has(d.name) ? { begin: d.body, end: d.end ?? '' } : {})
		}))
	};
}

export function extractUserMacros(text: string): UserMacroDef[] {
	return extractUserDefinitions(text).macros;
}
