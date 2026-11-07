import { describe, it, expect } from 'vitest';
import { mdSchema } from '$lib/languages/markdown/visual/schema';
import { blockImports, inlineImports, markSaves } from '$lib/languages/markdown/visual/core/plugin/pluginMap';

describe('the Markdown plugins', () => {
	it('leave the schema in the order ProseMirror takes its defaults from', () => {
		const nodes: string[] = [];
		mdSchema.spec.nodes.forEach((name) => nodes.push(name));
		expect(nodes).toEqual([
			'doc',
			'paragraph',
			'blockquote',
			'horizontal_rule',
			'heading',
			'code_block',
			'raw_latex',
			'inline_latex',
			'block_math',
			'inline_math',
			'text',
			'hard_break',
			'image',
			'list',
			'table',
			'table_row',
			'table_cell',
			'table_header'
		]);
		const marks: string[] = [];
		mdSchema.spec.marks.forEach((name) => marks.push(name));
		expect(marks).toEqual(['link', 'em', 'strong', 'code', 's']);
	});

	it('read each tree node by name, a tag first as a line break and the marks nest link, strong, em, strike', () => {
		for (const name of ['BulletList', 'OrderedList', 'Table', 'FencedCode', 'MathBlock', 'FootnoteDefinition', 'Blockquote'])
			expect(blockImports.has(name)).toBe(true);
		expect(inlineImports.get('HTMLTag')).toHaveLength(1);
		expect([...markSaves.keys()]).toEqual(['link', 'strong', 'em', 's']);
	});
});
