// @vitest-environment jsdom
import { describe, it, expect } from 'vitest';
import { EditorState } from '@codemirror/state';
import { EditorView } from '@codemirror/view';
import { CompletionContext } from '@codemirror/autocomplete';
import { bibFileCompletionSource } from '../../../../../../src/lib/languages/latex/intellisense/completion/bibFile';

function accept(label: string): string {
	const view = new EditorView({ state: EditorState.create({ doc: label.slice(0, 4) }), parent: document.body });
	const result = bibFileCompletionSource(new CompletionContext(view.state, view.state.doc.length, false));
	const option = result!.options.find((o) => o.label === label)!;
	(option.apply as (v: EditorView, c: unknown, from: number, to: number) => void)(view, option, result!.from, view.state.doc.length);
	const text = view.state.doc.toString();
	view.destroy();
	return text;
}

describe('.bib entry type snippet', () => {
	it('inserts year for a date or year rule, after the all fields in the form order', () => {
		const fields = [...accept('@article').matchAll(/^\s+(\w+) =/gm)].map((m) => m[1]);
		expect(fields).toEqual(['author', 'title', 'journaltitle', 'year']);
	});
});
