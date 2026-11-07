import { describe, expect, it } from 'vitest';
import { EditorState, TextSelection } from 'prosemirror-state';
import { loadPackage, loadedPackage, typstFileScope } from '$lib/languages/typst/knowledge';
import { typstArgumentsAt } from '$lib/languages/typst/visual/core/plugin/typstInsertArguments';
import { typSchema } from '$lib/languages/typst/visual/schema';

function stateIn(args: string | null) {
	const env = typSchema.nodes.typ_env.create({ name: 'clue', args }, typSchema.nodes.paragraph.create());
	const doc = typSchema.nodes.doc.create(null, env);
	return EditorState.create({ doc, selection: TextSelection.create(doc, 2) });
}

describe('the arguments Insert offers in a call', () => {
	it('offers the named parameters not written yet, with their defaults, and writes one', async () => {
		await loadPackage('@preview/gentle-clues:1.3.1', null);
		const scope = typstFileScope('#import "@preview/gentle-clues:1.3.1": *\n', loadedPackage);
		const offers = typstArgumentsAt(stateIn('accent-color: red'), scope);
		const names = offers.map((o) => o.label);
		expect(names).toContain('title');
		expect(names).toContain('width');
		expect(names).not.toContain('accent-color');
		const state = stateIn('accent-color: red');
		let next = state;
		offers.find((o) => o.label === 'title')!.run('')(state, (tr) => (next = state.apply(tr)));
		expect(next.doc.firstChild!.attrs.args).toBe('accent-color: red, title: []');
	});
});
