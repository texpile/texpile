// @vitest-environment jsdom
import { describe, expect, it } from 'vitest';
import { typSchema } from '$lib/languages/typst/visual/schema';
import {
	blockCalls,
	elementCalls,
	inlineCalls,
	inlineSaves,
	markSaves,
	markupBlocks,
	markupInline,
	nodeSaves
} from '$lib/languages/typst/visual/core/plugin/documentMap';

// the core writes these itself, and a caption or a grid's cell is written by the node holding it
const WRITTEN_ELSEWHERE = ['doc', 'paragraph', 'text', 'raw_latex', 'inline_latex', 'includedoc', 'typ_env'];
const HELD = ['table_caption', 'table_notes', 'typ_figure_caption', 'typ_grid_cell'];

describe('documentMap', () => {
	it('saves every node and mark of the schema, through a plugin or the core', () => {
		const nodes = Object.keys(typSchema.nodes).filter(
			(name) => !WRITTEN_ELSEWHERE.includes(name) && !HELD.includes(name) && !nodeSaves.has(name) && !inlineSaves.has(name)
		);
		// inline raw is written inside its run
		const marks = Object.keys(typSchema.marks).filter((name) => name !== 'code' && !markSaves.has(name));
		expect({ nodes, marks }).toEqual({ nodes: [], marks: [] });
	});

	it('reads the names and markup the converter read before the plugins', () => {
		const blocks = ['figure', 'table', 'quote', 'heading', 'grid', 'line', 'image', 'texpile-crop'];
		const inline = ['link', 'underline', 'super', 'sub', 'highlight', 'text', 'emph', 'strong', 'cite', 'ref', 'raw'];
		const markup = ['Heading', 'ListItem', 'EnumItem', 'TermItem', 'Raw', 'Equation'];
		const inlineMarkup = ['Strong', 'Emph', 'Link', 'Linebreak', 'Ref', 'Raw', 'Equation'];
		expect(blocks.filter((name) => !blockCalls.has(name))).toEqual([]);
		expect(inline.filter((name) => !inlineCalls.has(name))).toEqual([]);
		expect(['linebreak', 'link'].filter((name) => !elementCalls.has(name))).toEqual([]);
		expect(markup.filter((kind) => !markupBlocks.has(kind))).toEqual([]);
		expect(inlineMarkup.filter((kind) => !markupInline.has(kind))).toEqual([]);
	});

	it('nests marks in the order the serializer always wrote them, outermost first', () => {
		expect([...markSaves.keys()]).toEqual(['typ_text', 'typ_call', 'textcolor', 'highlight', 'u', 'sup', 'sub', 'link', 'strong', 'em']);
	});
});
