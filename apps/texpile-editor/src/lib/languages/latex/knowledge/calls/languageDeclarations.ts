// the calls that declare the document's language, by the declaration the data marks on a language argument
import { callsIn, rolesOf } from './commandCalls';

export type LanguageDeclaration = {
	name: string;
	main: boolean;
	/** the text of the optional argument before the name, null when the call has none */
	options: string | null;
	/** the call as written */
	from: string;
};

/** the languages `code` declares with a command, in order; comments are the caller's to mask */
export function languageDeclarationsIn(code: string): LanguageDeclaration[] {
	return callsIn(code, ['language']).flatMap((call) =>
		call.args.flatMap((a) => {
			if (!a.arg.declaration || !rolesOf(a.arg).includes('language')) return [];
			const options = call.args.find((o) => o.arg.kind === 'o' && o.index < a.index);
			return a.values.map((v) => ({
				name: v.value,
				main: a.arg.declaration === 'main',
				options: options ? code.slice(options.from, options.to) : null,
				from: code.slice(call.at, call.end)
			}));
		})
	);
}
