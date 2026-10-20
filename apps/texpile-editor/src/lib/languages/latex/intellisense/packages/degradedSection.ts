import type { Completion, CompletionSection } from '@codemirror/autocomplete';
import { m } from '$lib/paraglide/messages';

/** with the file's packages unknown, the list says so in its heading */
export function withDegradedHeading<T extends Completion>(options: T[], degraded: boolean): T[] {
	if (!degraded) return options;
	const section: CompletionSection = { name: m.intellisense_degraded() };
	return options.map((o) => ({ ...o, section }));
}
