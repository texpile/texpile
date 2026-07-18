// "@" mnemonic quick-symbol completion (LaTeX Workshop's @-suggestions), from data/atSuggestions.ts.
import { snippetCompletion, type Completion, type CompletionContext, type CompletionResult } from '@codemirror/autocomplete';
import { AT_SUGGESTIONS } from '../data/atSuggestions';

const OPTIONS: Completion[] = AT_SUGGESTIONS.map((s) =>
	snippetCompletion(s.body, { label: '@' + s.prefix, type: 'text', detail: s.detail })
);

// leading @ plus optionally one more (the @@ mnemonic), then the rest of the token
const AT_TRIGGER = /@@?[^\s@]*$/;

export function atSuggestionCompletionSource(ctx: CompletionContext): CompletionResult | null {
	const match = ctx.matchBefore(AT_TRIGGER);
	if (!match) return null;
	return { from: match.from, options: OPTIONS, validFor: /^@@?[^\s@]*$/ };
}
