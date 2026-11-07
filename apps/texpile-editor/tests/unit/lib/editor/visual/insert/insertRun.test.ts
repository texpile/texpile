import { describe, expect, it } from 'vitest';
import { EditorState, TextSelection, type Transaction } from 'prosemirror-state';
import { schema } from '$lib/languages/latex/schema/latexPMSchema';
import { serializeToLatex } from '$lib/languages/latex/serializer/latexSerializer';
import {
	allowedAtCaret,
	insertBlockAfter,
	insertBlockAtCaret,
	replaceSelectionWithBlock,
	styleAt,
	turnIntoStyle
} from '$lib/editor/visual/insert/insertRun';
import { matchingItems } from '$lib/editor/visual/insert/insertSearch';
import { documentFileIds, documentPackages } from '$lib/languages/latex/intellisense/packages/loadedPackages';
import { latexInsertItems } from '$lib/languages/latex/visual/core/plugin/insertList';
import type { BlockInsertItem } from '$lib/editor/visual/insert/insertItem';

async function listOf(text: string) {
	const items = latexInsertItems({ loaded: await documentPackages(text), direct: documentFileIds(text), definitions: text });
	return { items, byId: (id: string) => items.find((i) => i.id === id) as BlockInsertItem };
}

async function deckStyles() {
	return (await listOf('\\documentclass{beamer}\n\\begin{document}\n')).byId;
}

function apply(state: EditorState, tr: Transaction | null): EditorState {
	return tr ? state.apply(tr) : state;
}

const AMSTHM =
	'\\documentclass{article}\n\\usepackage{amsthm}\n\\newtheorem{theorem}{Theorem}\n\\newtheorem{lemma}{Lemma}\n\\begin{document}\n';

function caretIn(words: string): EditorState {
	const doc = schema.nodes.doc.create(null, [schema.nodes.paragraph.create(null, schema.text(words))]);
	return EditorState.create({ doc, selection: TextSelection.create(doc, 3) });
}

describe('a paragraph turned into a style', () => {
	it('keeps its words inside a frame, and the style list then reads Frame', async () => {
		const style = await deckStyles();
		let state = caretIn('Results');
		turnIntoStyle(state, style('frame'), (tr) => (state = state.apply(tr)));
		expect(serializeToLatex(state.doc)).toMatch(/\\begin\{frame\}\s*Results\s*\\end\{frame\}/);
		expect(styleAt(state, [style('standard'), style('frame')])?.id).toBe('frame');
	});

	it('becomes the section level, starred when picked unnumbered', async () => {
		const style = await deckStyles();
		let state = caretIn('Method');
		turnIntoStyle(state, style('subsection*'), (tr) => (state = state.apply(tr)));
		expect(serializeToLatex(state.doc)).toContain('\\subsection*{Method}');
	});
});

describe('a paragraph alone in an environment', () => {
	it('turns Theorem into Lemma and Standard back to the original', async () => {
		const { byId } = await listOf(AMSTHM);
		let state = caretIn('Words');
		const turn = (id: string) => turnIntoStyle(state, byId(id), (tr) => (state = state.apply(tr)));
		const original = serializeToLatex(state.doc);
		turn('env:theorem');
		turn('env:lemma');
		expect(serializeToLatex(state.doc)).toMatch(/\\begin\{lemma\}\s*Words\s*\\end\{lemma\}/);
		expect(serializeToLatex(state.doc)).not.toContain('theorem');
		turn('standard');
		expect(serializeToLatex(state.doc)).toBe(original);
	});

	it('keeps the optional title when a theorem becomes another one', async () => {
		const { byId } = await listOf(AMSTHM);
		const p = schema.nodes.paragraph.create(null, schema.text('x'));
		const doc = schema.nodes.doc.create(null, [schema.nodes.environment.create({ name: 'theorem', args: '[Pythagoras]' }, p)]);
		let state = EditorState.create({ doc, selection: TextSelection.create(doc, 3) });
		turnIntoStyle(state, byId('env:lemma'), (tr) => (state = state.apply(tr)));
		expect(state.doc.firstChild!.attrs).toMatchObject({ name: 'lemma', args: '[Pythagoras]' });
	});

	it('starts a box with the argument it cannot compile without, and leaves out what needs its own declaration', async () => {
		const { items, byId } = await listOf('\\documentclass{article}\n\\usepackage{multicol,amsmath}\n\\begin{document}\n');
		const args = (id: string) => (byId(id).make(schema) as ReturnType<typeof schema.nodes.environment.create>).attrs.args;
		expect([args('env:minipage'), args('env:multicols'), args('env:picture')]).toEqual(['{\\linewidth}', '{2}', '(100,100)']);
		expect(items.map((i) => i.id)).not.toContain('env:lrbox');
		expect(items.map((i) => i.id)).not.toContain('\\intertext');
	});

	it('writes an empty equation as an environment the math field can take the caret in', async () => {
		const { byId } = await listOf('\\documentclass{article}\n\\begin{document}\n');
		const node = byId('math:equation').make(schema)!;
		expect(node.textContent).toBe(' ');
		expect(serializeToLatex(schema.nodes.doc.create(null, [node]))).toMatch(/^\\begin\{equation\}\\label\{[^}]+\}\n\\end\{equation\}/);
	});

	it('unwraps center on Standard and leaves a minipage', async () => {
		const { byId } = await listOf(AMSTHM);
		const p = schema.nodes.paragraph.create(null, schema.text('x'));
		for (const [name, unwrapped] of [
			['center', true],
			['minipage', false]
		] as const) {
			const doc = schema.nodes.doc.create(null, [schema.nodes.environment.create({ name }, p)]);
			let state = EditorState.create({ doc, selection: TextSelection.create(doc, 3) });
			turnIntoStyle(state, byId('standard'), (tr) => (state = state.apply(tr)));
			expect(state.doc.firstChild!.type.name, name).toBe(unwrapped ? 'paragraph' : 'environment');
		}
	});

	it('swaps one overlay environment for another in a deck', async () => {
		const byId = await deckStyles();
		const p = schema.nodes.paragraph.create(null, schema.text('x'));
		const doc = schema.nodes.doc.create(null, [schema.nodes.environment.create({ name: 'onlyenv' }, p)]);
		let state = EditorState.create({ doc, selection: TextSelection.create(doc, 3) });
		turnIntoStyle(state, byId('uncoverenv'), (tr) => (state = state.apply(tr)));
		expect(state.doc.firstChild!.attrs.name).toBe('uncoverenv');
		expect(state.doc.firstChild!.firstChild!.type.name).toBe('paragraph');
	});

	it('wraps only its own paragraph where the environment holds others, and Standard leaves it', async () => {
		const { byId } = await listOf(AMSTHM);
		const p = (words: string) => schema.nodes.paragraph.create(null, schema.text(words));
		const doc = schema.nodes.doc.create(null, [schema.nodes.environment.create({ name: 'theorem' }, [p('One'), p('Two')])]);
		let state = EditorState.create({ doc, selection: TextSelection.create(doc, 3) });
		turnIntoStyle(state, byId('standard'), (tr) => (state = state.apply(tr)));
		expect(state.doc.eq(doc)).toBe(true);
		turnIntoStyle(state, byId('env:lemma'), (tr) => (state = state.apply(tr)));
		expect(state.doc.firstChild!.childCount).toBe(2);
		expect(state.doc.firstChild!.firstChild!.type.name).toBe('environment');
	});
});

describe('Standard on a list item', () => {
	it('takes only that item out of the list', async () => {
		const { byId } = await listOf(AMSTHM);
		const item = (words: string) => schema.nodes.list.create({ kind: 'bullet' }, schema.nodes.paragraph.create(null, schema.text(words)));
		const doc = schema.nodes.doc.create(null, [item('One'), item('Two'), item('Three')]);
		let state = EditorState.create({ doc, selection: TextSelection.create(doc, 1 + item('One').nodeSize + 2) });
		turnIntoStyle(state, byId('standard'), (tr) => (state = state.apply(tr)));
		expect(state.doc.toString()).toBe('doc(list(paragraph("One")), paragraph("Two"), list(paragraph("Three")))');
		expect(state.selection.$from.parent.textContent).toBe('Two');
	});
});

describe('a section style inside a frame', () => {
	it('is refused and not offered to the caret', async () => {
		const style = await deckStyles();
		const p = schema.nodes.paragraph.create(null, schema.text('Words'));
		const doc = schema.nodes.doc.create(null, [schema.nodes.frame.create({ form: 'env' }, p)]);
		const state = EditorState.create({ doc, selection: TextSelection.create(doc, 3) });
		expect(allowedAtCaret(state, style('section'))).toBe(false);
		expect(turnIntoStyle(state, style('section'), () => {})).toBe(false);
	});
});

describe('a block put in from the list', () => {
	it('leaves the caret in the first text of what it put in', async () => {
		const { items } = await listOf(AMSTHM);
		const blocks = items.filter((i): i is BlockInsertItem => i.shape === 'block' && !i.style && i.select !== 'node');
		expect(blocks.map((i) => i.id)).toContain('table');
		for (const item of blocks) {
			const state = caretIn('Words');
			const after = apply(state, insertBlockAtCaret(state, item));
			expect(after.selection instanceof TextSelection, item.id).toBe(true);
			expect(after.selection.$from.parent.isTextblock, item.id).toBe(true);
			expect(after.selection.$from.pos, item.id).toBeGreaterThan(state.doc.firstChild!.nodeSize);
			if (item.id === 'table') expect(after.selection.$from.node(-1).type.name, 'a cell, not the caption').toBe('table_cell');
		}
	});

	it('gives a list item a next item for a paragraph and holds any other block inside it', async () => {
		const { byId } = await listOf(AMSTHM);
		const item = schema.nodes.list.create({ kind: 'bullet' }, schema.nodes.paragraph.create(null, schema.text('a')));
		const doc = schema.nodes.doc.create(null, [item]);
		const state = EditorState.create({ doc, selection: TextSelection.create(doc, 2) });
		const next = apply(state, insertBlockAfter(state, 0, byId('standard')));
		expect(next.doc.childCount).toBe(2);
		expect(next.doc.child(1).type.name).toBe('list');
		expect(next.selection.$from.node(-1)).toBe(next.doc.child(1));
		const inside = apply(state, insertBlockAfter(state, 0, byId('displaymath')));
		expect(inside.doc.childCount).toBe(1);
		expect(inside.doc.firstChild!.childCount).toBe(2);
		expect(inside.selection.$from.parent.type.name).toBe('list');
	});

	it('goes after the frame holding the caret, never inside it', async () => {
		const { byId } = await listOf('\\documentclass{beamer}\n\\begin{document}\n');
		const frame = schema.nodes.frame.create({ form: 'env' }, schema.nodes.paragraph.create(null, schema.text('Body')));
		const doc = schema.nodes.doc.create(null, [frame]);
		const state = EditorState.create({ doc, selection: TextSelection.create(doc, 3) });
		const after = apply(state, insertBlockAtCaret(state, byId('frame')));
		expect(after.doc.childCount).toBe(2);
		expect(after.doc.child(0).eq(frame)).toBe(true);
		expect(after.selection.$from.node(-1).type.name).toBe('frame');
		expect(after.selection.$from.before(-1)).toBe(frame.nodeSize);
	});
});

describe('the insert search', () => {
	it('lists the label that is the query first', async () => {
		const { items } = await listOf(AMSTHM);
		expect(matchingItems(items, 'theorem')[0].label).toBe('Theorem');
		expect(matchingItems(items, 'lem')[0].label).toBe('Lemma');
	});
});

describe('a block put in at a caret mid-paragraph', () => {
	it('leaves the half after it without its leading space', () => {
		const doc = schema.nodes.doc.create(null, [schema.nodes.paragraph.create(null, schema.text('ab cd'))]);
		const state = EditorState.create({ doc, selection: TextSelection.create(doc, 3) });
		const tr = replaceSelectionWithBlock(state.tr, schema.nodes.horizontal_rule.create());
		const texts: string[] = [];
		tr.doc.forEach((n) => texts.push(n.textContent));
		expect(texts).toEqual(['ab', '', 'cd']);
	});
});
