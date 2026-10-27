import { commonEnvFacts } from '../../knowledge/environments/envFacts';
import { scanMath } from '../../intellisense/completion/mathScan';
import type { UserDefinitions } from '../../intellisense/completion/userMacroScan';

export type OwnMath = { opens: Set<string>; closes: Set<string>; environments: Set<string> };

export const NO_OWN_MATH: OwnMath = { opens: new Set(), closes: new Set(), environments: new Set() };

export function ownMathOf(definitions: UserDefinitions): OwnMath {
	const own: OwnMath = { opens: new Set(), closes: new Set(), environments: new Set() };
	for (const d of definitions.macros) {
		if (d.body === undefined || d.signature !== '') continue;
		const scan = scanMath(d.body, commonEnvFacts);
		if (scan.math) own.opens.add(d.name);
		else if (!scan.sound) own.closes.add(d.name);
	}
	for (const e of definitions.environments)
		if (e.begin !== undefined && scanMath(e.begin, commonEnvFacts).math) own.environments.add(e.name);
	return own;
}

let current = NO_OWN_MATH;

export function setOwnMath(own: OwnMath): void {
	current = own;
}

export function ownMath(): OwnMath {
	return current;
}
