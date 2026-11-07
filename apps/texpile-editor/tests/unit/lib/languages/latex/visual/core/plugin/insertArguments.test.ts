import { describe, expect, it } from 'vitest';
import { EditorState, TextSelection } from 'prosemirror-state';
import type { Node } from 'prosemirror-model';
import { schema } from '$lib/languages/latex/schema/latexPMSchema';
import { serializeToLatex } from '$lib/languages/latex/serializer/latexSerializer';
import { documentPackages } from '$lib/languages/latex/intellisense/packages/loadedPackages';
import { latexArgumentsAt } from '$lib/languages/latex/visual/core/plugin/insertArguments';

async function argumentsIn(cls: string, block: Node) {
	const loaded = await documentPackages(`\\documentclass{${cls}}\n\\begin{document}\n`);
	let state = EditorState.create({ doc: schema.nodes.doc.create(null, [block]) });
	state = state.apply(state.tr.setSelection(TextSelection.near(state.doc.resolve(2))));
	function run(label: string, value: string) {
		const argument = latexArgumentsAt(state, loaded).find((a) => a.label === label)!;
		argument.run(value)(state, (tr) => (state = state.apply(tr)));
	}
	return { labels: () => latexArgumentsAt(state, loaded).map((a) => a.label), run, latex: () => serializeToLatex(state.doc) };
}

describe('the arguments Insert offers at the caret', () => {
	it("writes a frame's overlay and options where Beamer reads them, and offers each once", async () => {
		const frame = schema.nodes.frame.create({ form: 'env' }, schema.nodes.paragraph.create(null, schema.text('Body')));
		const at = await argumentsIn('beamer', frame);
		expect(at.labels()).toEqual(['Frame Title', 'Frame Subtitle', 'Overlay Specification', 'Default Overlay Specification', 'Options']);
		at.run('Options', 'fragile');
		at.run('Overlay Specification', '2-');
		expect(at.latex()).toContain('\\begin{frame}<2->[fragile]');
		expect(at.labels()).toEqual(['Frame Title', 'Frame Subtitle', 'Default Overlay Specification']);
	});

	it('gives a section its short title as the bracket, and none to a starred one', async () => {
		const at = await argumentsIn('article', schema.nodes.heading.create({ level: 1 }, schema.text('A long title')));
		at.run('Short Title', 'Short');
		expect(at.latex()).toContain('\\section[Short]{A long title}');
		const starred = await argumentsIn('article', schema.nodes.heading.create({ level: 1, numbered: false }, schema.text('A')));
		expect(starred.labels()).toEqual([]);
	});
});
