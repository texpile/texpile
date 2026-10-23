// applies the ruleTable to parsed entries

import type { LogEntry } from '$lib/compileLog/types';
import type { Engine } from '$lib/workspace/compileCommand';
import { RULES } from './ruleTable';

/** attaches ruleId/hint/suggestedPackage/command (mutating) and drops summary entries that restate earlier ones. */
export function enrichLogEntries(entries: LogEntry[], engine: Engine | null = null): LogEntry[] {
	const seen = new Set<string>();
	const kept: LogEntry[] = [];
	for (const entry of entries) {
		const rule = RULES.find((r) => r.match.test(entry.message));
		if (rule) {
			entry.ruleId = rule.id;
			const m = entry.message.match(rule.match)!;
			if (typeof rule.hint === 'function') entry.hint = rule.hint(entry, m, engine);
			else if (rule.hint) entry.hint = rule.hint;
			if (rule.command) entry.command = rule.command(entry);
			if (rule.anchor && entry.anchorText === undefined) entry.anchorText = rule.anchor(m);
			if (entry.hint) {
				const pkg = entry.hint.match(/\\usepackage\{([\w-]+)\}/);
				if (pkg) entry.suggestedPackage = pkg[1];
			}
			if (rule.cascadesFrom?.some((id) => seen.has(id))) {
				continue; // drop the restatement, the root cause is already listed
			}
			seen.add(rule.id);
		}
		kept.push(entry);
	}
	return kept;
}
