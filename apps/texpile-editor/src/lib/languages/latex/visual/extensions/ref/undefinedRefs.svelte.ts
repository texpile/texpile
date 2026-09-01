import { compileLog } from '$lib/stores/compileLogStore';

// The labels the last run reported undefined, by name. Derived once for the whole document
// rather than per chip: a paper carries hundreds of references and one set answers all of them.
const names = $derived(
	new Set(
		(compileLog.current?.entries ?? []).filter((e) => e.ruleId === 'undefined-reference' && e.anchorText).map((e) => e.anchorText as string)
	)
);

export const undefinedRefs = {
	get current(): ReadonlySet<string> {
		return names;
	}
};
