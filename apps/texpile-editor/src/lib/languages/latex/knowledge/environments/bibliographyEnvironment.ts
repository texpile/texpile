// the environment whose entries are \bibitem, as the edges a text shows it by
import { commonEnvNames, envNameAlternation } from './envFacts';

let alternation: string | null = null;

function names(): string {
	alternation ??= envNameAlternation(commonEnvNames((f) => f.item?.includes('bibitem') ?? false));
	return alternation;
}

export function bibliographyBegin(): RegExp {
	return new RegExp(`\\\\begin\\s*\\{\\s*(?:${names()})\\s*\\}`);
}

export function bibliographyEnd(): RegExp {
	return new RegExp(`\\\\end\\s*\\{\\s*(?:${names()})\\s*\\}`);
}
