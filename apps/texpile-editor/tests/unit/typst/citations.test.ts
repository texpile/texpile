// A reference is one typ_ref atom whichever of typst's spellings wrote it: `@key`, `@key[p. 7]`
// and `#cite(<key>, supplement: [..], form: "..")`. Unedited it keeps its spelling byte for byte;
// edited, it is written the plainest way that says everything it holds.
import { describe, it, expect } from 'vitest';
import { EditorState, TextSelection } from 'prosemirror-state';
import type { Node } from 'prosemirror-model';
import { parseTypstFile, serializeTypstFile } from '$lib/languages/typst/visual/roundtrip';
import { serializeToTypst } from '$lib/languages/typst/visual/serialize/serializer';
import { typstToProseMirror } from '$lib/languages/typst/visual/convert/converter';
import { typSchema } from '$lib/languages/typst/visual/schema';

const BIB = '\n#bibliography("refs.bib")\n';

/** citation fixtures, each real Typst against the refs.bib the compile check provides */
export const CITATIONS: Record<string, string> = {
	bare: `As shown by @typst2023, it works.\n${BIB}`,
	supplement: `See @typst2023[p. 7] and @typst2023[] for more.\n${BIB}`,
	citeCalls: `#cite(<typst2023>) and #cite(<typst2023>, form: "prose") and #cite(<typst2023>, supplement: [ch. 2], form: "author").\n${BIB}`,
	awkwardCall: `Year #cite( <typst2023> ,form:"year" ) only.\n${BIB}`,
	refSupplement:
		'#set heading(numbering: "1.")\n\n= Intro <sec:intro>\n\nSee @sec:intro[Chapter] and #ref(<sec:intro>, supplement: [Part]).\n',
	marked: `*Bold @typst2023[p. 1]* and _#cite(<typst2023>, form: "prose")_.\n\n- in a list @typst2023[pp. 3--5]\n${BIB}`,
	inHeading: `= On @typst2023[p. 2]\n${BIB}`
};

/** shapes that stay chips: the atom has no slot for what they carry */
const CHIPS: Record<string, string> = {
	style: 'A #cite(<k>, style: "apa") cite.\n',
	computed: 'A #cite(label("k")) cite.\n',
	noForm: 'A #cite(<k>, form: none) cite.\n',
	stringSupplement: 'A #cite(<k>, supplement: "p. 3") cite.\n',
	refForm: 'A #ref(<k>, form: "page") ref.\n'
};

function roundtrip(src: string): string {
	const parsed = parseTypstFile(src);
	return serializeTypstFile(parsed, parsed.doc);
}

function refs(doc: Node): { node: Node; pos: number }[] {
	const out: { node: Node; pos: number }[] = [];
	doc.descendants((node, pos) => {
		if (node.type.name === 'typ_ref') out.push({ node, pos });
	});
	return out;
}

function attrsOf(src: string): Record<string, unknown>[] {
	return refs(typstToProseMirror(src).doc).map(({ node }) => ({ ...node.attrs }));
}

/** parse, change one reference's attrs, save */
function editRef(src: string, attrs: Record<string, unknown>, which = 0): string {
	const parsed = parseTypstFile(src);
	const { node, pos } = refs(parsed.doc)[which];
	const tr = EditorState.create({ doc: parsed.doc }).tr.setNodeMarkup(pos, undefined, { ...node.attrs, ...attrs });
	return serializeTypstFile(parsed, tr.doc);
}

describe('references round-trip byte for byte', () => {
	for (const [name, src] of Object.entries({ ...CITATIONS, ...CHIPS })) {
		it(name, () => expect(roundtrip(src)).toBe(src));
	}
});

describe('regeneration reaches a fixed point', () => {
	for (const [name, src] of Object.entries({ ...CITATIONS, ...CHIPS })) {
		it(name, () => {
			const gen1 = serializeToTypst(typstToProseMirror(src).doc);
			expect(serializeToTypst(typstToProseMirror(gen1).doc)).toBe(gen1);
		});
	}
});

describe('every spelling is one atom', () => {
	it('a supplement rides verbatim, the empty one included', () => {
		expect(attrsOf('@k[p. 7] @k[] @k\n')).toEqual([
			{ target: 'k', supplement: 'p. 7', form: null },
			{ target: 'k', supplement: '', form: null },
			{ target: 'k', supplement: null, form: null }
		]);
	});

	it('a cite call carries its form and supplement', () => {
		expect(attrsOf(CITATIONS.citeCalls)).toEqual([
			{ target: 'typst2023', supplement: null, form: null },
			{ target: 'typst2023', supplement: null, form: 'prose' },
			{ target: 'typst2023', supplement: 'ch. 2', form: 'author' }
		]);
	});

	it('a ref call carries its supplement', () => {
		expect(attrsOf(CITATIONS.refSupplement)).toEqual([
			{ target: 'sec:intro', supplement: 'Chapter', form: null },
			{ target: 'sec:intro', supplement: 'Part', form: null }
		]);
	});

	it('a lone cite call is still prose, not a raw block', () => {
		expect(typstToProseMirror('#cite(<k>, form: "prose")\n').doc.child(0).type.name).toBe('paragraph');
	});

	it('richer calls stay chips', () => {
		for (const src of Object.values(CHIPS)) expect(refs(typstToProseMirror(src).doc)).toEqual([]);
	});
});

describe('an edited reference is written the plainest way', () => {
	it('a supplement goes in brackets after the marker', () => {
		expect(editRef(CITATIONS.bare, { supplement: 'p. 7' })).toBe(CITATIONS.bare.replace('@typst2023', '@typst2023[p. 7]'));
	});

	it('a form takes the call, supplement first as cite lists them', () => {
		const out = editRef(CITATIONS.supplement, { form: 'prose' });
		expect(out).toBe(CITATIONS.supplement.replace('@typst2023[p. 7]', '#cite(<typst2023>, supplement: [p. 7], form: "prose")'));
	});

	it('taking the form away goes back to the marker', () => {
		const out = editRef(CITATIONS.citeCalls, { form: null }, 2);
		expect(out).toBe(CITATIONS.citeCalls.replace('#cite(<typst2023>, supplement: [ch. 2], form: "author")', '@typst2023[ch. 2]'));
	});

	it('only the edited reference changes, the others keep their spelling', () => {
		const out = editRef(CITATIONS.citeCalls, { supplement: 'p. 9' }, 1);
		expect(out).toBe(CITATIONS.citeCalls.replace('form: "prose")', 'supplement: [p. 9], form: "prose")'));
		expect(out).toContain('#cite(<typst2023>) and');
	});

	it('a supplement on a reference to a label', () => {
		const out = editRef(CITATIONS.refSupplement, { supplement: 'Section' });
		expect(out).toBe(CITATIONS.refSupplement.replace('@sec:intro[Chapter]', '@sec:intro[Section]'));
	});

	it('typing next to an untouched cite call keeps the call', () => {
		const parsed = parseTypstFile(CITATIONS.citeCalls);
		const state = EditorState.create({ doc: parsed.doc });
		const tr = state.tr.setSelection(TextSelection.create(state.doc, 1)).insertText('Both ');
		expect(serializeTypstFile(parsed, tr.doc)).toBe('Both ' + CITATIONS.citeCalls);
	});
});

describe('references the editor makes', () => {
	const n = typSchema.nodes;
	const out = (...content: Node[]) => serializeToTypst(n.doc.create(null, [n.paragraph.create(null, content)]));

	it('text straight after a call or a supplement is not read as more of it', () => {
		const cite = n.typ_ref.create({ target: 'k', form: 'year' });
		const src = out(cite, typSchema.text('(s) and [t]'));
		expect(src).toBe('#cite(<k>, form: "year")\\(s) and \\[t\\]');
		expect(attrsOf(src + '\n')).toEqual([{ target: 'k', supplement: null, form: 'year' }]);
		const supplemented = out(n.typ_ref.create({ target: 'k', supplement: 'p. 2' }), typSchema.text('s'));
		expect(supplemented).toBe('@k[p. 2]s');
		const back = typstToProseMirror(supplemented + '\n').doc.child(0);
		expect(back.childCount).toBe(2);
		expect(back.child(0).attrs).toEqual({ target: 'k', supplement: 'p. 2', form: null });
		expect(back.child(1).text).toBe('s');
	});
});
