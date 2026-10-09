import { hasNextSnippetField, hasPrevSnippetField, type CompletionContext, type CompletionResult } from '@codemirror/autocomplete';
import { StateEffect, StateField, type EditorState } from '@codemirror/state';

export type ChoiceField = { from: number; to: number; options: string[] };

export const addChoiceFields = StateEffect.define<ChoiceField[]>();

/** the ${n|a,b|} stops of the snippet being filled in; gone with the snippet */
export const choiceFields = StateField.define<ChoiceField[]>({
	create: () => [],
	update(fields, tr) {
		let next = tr.docChanged ? fields.map((f) => ({ ...f, from: tr.changes.mapPos(f.from, -1), to: tr.changes.mapPos(f.to, 1) })) : fields;
		for (const e of tr.effects) if (e.is(addChoiceFields)) next = [...next, ...e.value];
		if (next.length && !hasNextSnippetField(tr.state) && !hasPrevSnippetField(tr.state)) return [];
		return next;
	}
});

export function choiceFieldAt(state: EditorState, from: number, to: number): ChoiceField | null {
	return state.field(choiceFields, false)?.find((f) => f.from <= from && to <= f.to) ?? null;
}

export function choiceCompletionSource(ctx: CompletionContext): CompletionResult | null {
	const field = choiceFieldAt(ctx.state, ctx.pos, ctx.pos);
	if (!field) return null;
	return { from: field.from, to: field.to, filter: false, options: field.options.map((label) => ({ label, type: 'enum' })) };
}
