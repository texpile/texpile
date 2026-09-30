// A trailing `<label>` must not change what KIND of thing a block construct becomes.
//
// This property is about node SHAPE, not bytes, and that is the point. The bug it exists for -
// `#figure(table(...)) <tab-x>` whose table was too rich to model collapsing into a paragraph of
// inline chips - round-tripped byte-for-byte the whole time, because inline chips are verbatim
// too. The round-trip suite could not have caught it. What it looked like in the editor was a
// 17-line block crammed into an inline span with the label floating beside it.
//
// Two outcomes are both correct, and which one applies is decided by the schema, not by taste:
// a node type with a `label` attr keeps its modelled form, and one without falls back to a raw
// island - because swallowing a label into a node with nowhere to put it deletes it on the next
// save. What is never correct is a block turning into inline chips.
import { describe, it, expect } from 'vitest';
import { typstToProseMirror } from '$lib/languages/typst/visual/convert/converter';
import { typSchema } from '$lib/languages/typst/visual/schema';
import { parseTypstFile, serializeTypstFile } from '$lib/languages/typst/visual/roundtrip';

/** the rich table from the bug report. It now graduates to a real editable table_wrapper, so what
 *  it guards here is the label path on a MODELLED node; the vline table below guards the raw one. */
export const RICH_TABLE = `#figure(
  table(
    columns: (auto, auto, auto),
    stroke: none,
    table.hline(),
    table.cell(colspan: 2)[*Quantity*], [*Unit*],
    table.hline(start: 0, end: 2),
    [*Symbol*], [*Name*], [],
    $x$, [Position], [m],
    table.hline(),
  ),
  caption: [Symbols, names, and SI units.],
)`;

/** block constructs that stand alone in a paragraph, modelled and unmodelled alike. */
export const BLOCKS: Record<string, string> = {
	simple_table_figure: '#figure(\n  table(\n    columns: 2,\n    [a], [b],\n  ),\n  caption: [Cap.],\n)',
	rich_table_figure: RICH_TABLE,
	bare_table: '#table(\n  columns: 2,\n  [a], [b],\n)',
	// a vline has no row model, so this one still falls all the way through to a raw island
	unmodellable_table: '#table(\n  columns: 2,\n  table.vline(x: 1),\n  [a], [b],\n)',
	image_figure: '#figure(image("a.png"), caption: [Cap.])',
	bare_image: '#image("a.png")',
	block_quote: '#quote(block: true)[Quoted.]',
	block_math: '$ x = 1 $',
	unmodelled_call: '#lorem(20)',
	// a real builtin the converter has no model for - the previous fixture here invented a function
	// name, which our parser was happy to treat as raw and typst rejected outright. Two bodies are
	// more than an environment holds
	unmodelled_builtin: '#grid(columns: 2)[a][b]',
	environment: '#rect(width: 2cm)[body]',
	divider: '#line(length: 100%)'
};

/** asked of the schema rather than hardcoded, so adding a label attr to a node updates the
 *  expectation here instead of turning this into a stale list. */
function canHoldLabel(typeName: string): boolean {
	return 'label' in (typSchema.nodes[typeName]?.spec.attrs ?? {});
}

const shape = (src: string) => typstToProseMirror(src).doc.content.content.map((n) => n.type.name);
const roundtrip = (src: string) => {
	const parsed = parseTypstFile(src);
	return serializeTypstFile(parsed, parsed.doc);
};

describe('a trailing <label> keeps a block a block', () => {
	for (const [name, body] of Object.entries(BLOCKS)) {
		it(`${name}: one top-level block, never a paragraph of chips`, () => {
			const labelled = shape(`${body} <lbl>\n`);
			expect(labelled).toHaveLength(1);
			expect(labelled[0]).not.toBe('paragraph');
		});

		it(`${name}: modelled iff the node can carry the label, else a raw island`, () => {
			const plain = shape(`${body}\n`)[0];
			const labelled = shape(`${body} <lbl>\n`)[0];
			expect(labelled).toBe(canHoldLabel(plain) ? plain : 'raw_latex');
		});

		it(`${name}: both forms save byte-identically`, () => {
			expect(roundtrip(`${body}\n`)).toBe(`${body}\n`);
			expect(roundtrip(`${body} <lbl>\n`)).toBe(`${body} <lbl>\n`);
		});
	}

	it('a label attached across a single newline is still the same block', () => {
		expect(shape(`${RICH_TABLE}\n<lbl>\n`)).toEqual(['table_wrapper']);
	});

	it('a modelled figure keeps the label as an attr, not as raw text', () => {
		const { doc } = typstToProseMirror('#image("a.png") <fig-a>\n');
		expect(doc.content.content[0].attrs.label).toBe('fig-a');
	});

	it('real content after the call still makes it inline, label or not', () => {
		// the guard the fallback must not lose: a call with prose after it is not a block
		expect(shape('#lorem(5) and then some prose.\n')).toEqual(['paragraph']);
		expect(shape('#lorem(5) <lbl> and then some prose.\n')).toEqual(['paragraph']);
	});
});
