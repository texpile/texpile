import { describe, expect, it } from 'vitest';
import { EditorState, TextSelection } from 'prosemirror-state';
import type { BlockInsertItem } from '$lib/editor/visual/insert/insertItem';
import { turnIntoStyle } from '$lib/editor/visual/insert/insertRun';
import { typstInsertItems } from '$lib/languages/typst/visual/core/plugin/typstInsertList';
import { typSchema } from '$lib/languages/typst/visual/schema';

describe('a style in a Typst file', () => {
	it('changes the function around a lone paragraph and Paragraph takes it away', async () => {
		const items = await typstInsertItems(
			'#import "@preview/ctheorems:1.1.3": *\n#let theorem = thmbox("theorem", "Theorem")\n#let lemma = thmplain("lemma", "Lemma")\n#let note(body) = block(body)\n'
		);
		const item = (id: string) => items.find((i) => i.id === id) as BlockInsertItem;
		const p = typSchema.nodes.paragraph.create(null, typSchema.text('words'));
		const doc = typSchema.nodes.doc.create(null, typSchema.nodes.typ_env.create({ name: 'theorem', args: 'x' }, p));
		const state = EditorState.create({ doc, selection: TextSelection.create(doc, 3) });
		let next = state;
		turnIntoStyle(state, item('env:lemma'), (tr) => (next = state.apply(tr)));
		expect(next.doc.toString()).toBe('doc(typ_env(paragraph("words")))');
		expect(next.doc.firstChild!.attrs).toMatchObject({ name: 'lemma', args: null });
		const renamed = next;
		turnIntoStyle(renamed, item('standard'), (tr) => (next = renamed.apply(tr)));
		expect(next.doc.toString()).toBe('doc(paragraph("words"))');
	});

	it('keeps a labelled theorem when Paragraph is picked, so its references still point at it', async () => {
		const items = await typstInsertItems('#import "@preview/ctheorems:1.1.3": *\n#let theorem = thmbox("theorem", "Theorem")\n');
		const standard = items.find((i) => i.id === 'standard') as BlockInsertItem;
		const p = typSchema.nodes.paragraph.create(null, typSchema.text('words'));
		const doc = typSchema.nodes.doc.create(null, typSchema.nodes.typ_env.create({ name: 'theorem', label: 't1' }, p));
		const state = EditorState.create({ doc, selection: TextSelection.create(doc, 3) });
		let next = state;
		turnIntoStyle(state, standard, (tr) => (next = state.apply(tr)));
		expect(next.doc.firstChild!.attrs).toMatchObject({ name: 'theorem', label: 't1' });
	});

	it('leaves a function the file makes as a plain box when Paragraph is picked', async () => {
		const items = await typstInsertItems('#let note(body) = block(body)\n');
		const standard = items.find((i) => i.id === 'standard') as BlockInsertItem;
		const p = typSchema.nodes.paragraph.create(null, typSchema.text('words'));
		const doc = typSchema.nodes.doc.create(null, typSchema.nodes.typ_env.create({ name: 'note' }, p));
		const state = EditorState.create({ doc, selection: TextSelection.create(doc, 3) });
		turnIntoStyle(state, standard, (tr) => expect(tr.doc.eq(doc)).toBe(true));
		expect(state.doc.firstChild!.type.name).toBe('typ_env');
	});
});
