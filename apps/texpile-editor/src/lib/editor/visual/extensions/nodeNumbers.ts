// the numbers a language hands a node view on its decorations, which the view draws as given
import type { Node as PMNode } from 'prosemirror-model';
import type { Transaction } from 'prosemirror-state';
import { ReplaceStep } from 'prosemirror-transform';
import type { Decoration } from 'prosemirror-view';

/** null when the language hands none, and the view counts them itself */
export function compiledNumbersOf(decorations: readonly Decoration[]): string[] | null {
	for (const d of decorations) if (Array.isArray(d.spec.numbers)) return d.spec.numbers as string[];
	return null;
}

function onlyText(fragment: PMNode['content']): boolean {
	return fragment.content.every((n) => n.isText);
}

/** the change only typed or deleted words inside one paragraph, which moves no number */
export function typedInParagraph(tr: Transaction): boolean {
	return tr.steps.every((step, i) => {
		if (!(step instanceof ReplaceStep) || !onlyText(step.slice.content)) return false;
		const doc = tr.docs[i];
		const $from = doc.resolve(step.from);
		return (
			$from.parent.type.name === 'paragraph' && $from.sameParent(doc.resolve(step.to)) && onlyText(doc.slice(step.from, step.to).content)
		);
	});
}
