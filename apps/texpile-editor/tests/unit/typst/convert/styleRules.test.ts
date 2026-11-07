// @vitest-environment jsdom
// a content block whose rules only set how its words look opens as its words, each rule a setting line among them; a
// block with any other rule stays code
import { describe, it, expect } from 'vitest';
import { EditorState } from 'prosemirror-state';
import { parseTypstFile, serializeTypstFile } from '$lib/languages/typst/visual/roundtrip';
import { typstFace } from '$lib/languages/typst/visual/core/walk/typstFace';

function typedAtEndOfFirstParagraph(src: string, text: string): string {
	const parsed = parseTypstFile(src);
	let at = -1;
	parsed.doc.descendants((node, pos) => {
		if (at < 0 && node.type.name === 'paragraph') at = pos + node.nodeSize - 1;
		return at < 0;
	});
	return serializeTypstFile(parsed, EditorState.create({ doc: parsed.doc }).tr.insertText(text, at).doc);
}

describe('a content block of style rules', () => {
	it('opens as its words with the rule as a setting, and an edit reaches only the words', () => {
		const src = 'Before.\n\n#[\n  #set text(size: 9pt, fill: red)\n  Some *words* here.\n]\n';
		const env = parseTypstFile(src).doc.child(1);
		expect(env.type.name).toBe('typ_env');
		expect(env.child(0).textContent).toBe('#set text(size: 9pt, fill: red)');
		expect(typstFace(env.child(0).textContent)?.dom.textContent).toBe('Text - 9pt - red');
		expect(typedAtEndOfFirstParagraph(src.replace('Before.\n\n', ''), '!')).toBe(src.replace('Before.\n\n', '').replace('here.', 'here.!'));
	});

	it('stays code with a page rule, a show rule or a computed value', () => {
		for (const src of [
			'#[#set page(flipped: true); words]\n',
			'#[#show heading: smallcaps; words]\n',
			'#[#set text(size: s * 2); words]\n'
		])
			expect(parseTypstFile(src).doc.child(0).type.name).toBe('raw_latex');
	});

	it('in a code block draws the rule as a setting before what the block prints', () => {
		expect(typstFace('#{ set text(font: "Virgil", size: 9pt); [hi] }')?.dom.textContent).toBe('Text - Virgil - 9pthi');
		expect(typstFace('#{ set page(width: 1cm); [hi] }')).toBeNull();
	});
});
