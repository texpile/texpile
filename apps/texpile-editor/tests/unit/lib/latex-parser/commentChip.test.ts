// A mid-paragraph comment is an inline chip whose text is the comment ALONE. The trailing
// newline the % consumes belongs to serialization, not to the chip: baked into the chip's text
// it rendered as a bogus empty second line. The serializer restores it, or the prose after the
// chip would be commented out on the next parse.
import { describe, it, expect } from 'vitest';
import type { Node } from 'prosemirror-model';
import { parseLatexFile, serializeLatexFile } from '$lib/workspace/latexRoundtrip';
import { withoutOrigins } from '$lib/editor/visual/parseOrigins';

const wrap = (body: string) => `\\documentclass{article}\n\\begin{document}\n${body}\n\\end{document}\n`;

function commentChip(doc: Node): Node {
	let found: Node | null = null;
	doc.descendants((n) => {
		if (n.type.name === 'inline_latex' && n.textContent.startsWith('%')) found = n;
	});
	if (!found) throw new Error('no comment chip');
	return found;
}

/** the paragraph rebuilt as a node no parse knows, so serialization must regenerate it */
function withParagraphRegenerated(doc: Node): Node {
	const kids: Node[] = [];
	for (let i = 0; i < doc.childCount; i++) {
		const child = doc.child(i);
		kids.push(child.type.name === 'paragraph' ? child.type.create(child.attrs, child.content, child.marks) : child);
	}
	return doc.copy(doc.type.schema.nodes.doc.createChecked(doc.attrs, kids).content);
}

describe('mid-paragraph comment chip', () => {
	// the comment sits on its own line INSIDE the paragraph (no blank line), the shape %}}} fold
	// markers take; a comment trailing prose on the same line is stripped elsewhere
	const src = wrap('prose before\n%note\nmore prose after');

	it('holds the comment alone, no trailing newline', () => {
		const parsed = parseLatexFile(src);
		expect(commentChip(parsed.doc).textContent).toBe('%note');
	});

	it('leaves an untouched doc byte-identical', () => {
		const parsed = parseLatexFile(src);
		expect(serializeLatexFile(parsed, parsed.doc)).toBe(src);
	});

	// the serializer gives the comment BOTH its line ends; mid-line emission used to rejoin it
	// onto the prose line, where the next parse stripped it as a same-line comment
	it('regeneration keeps the comment on its own line, and the chip survives the round trip', () => {
		const parsed = parseLatexFile(src);
		const out = serializeLatexFile(parsed, withParagraphRegenerated(parsed.doc));
		expect(out).toMatch(/\n%note\n/);
		const reparsed = parseLatexFile(out);
		expect(commentChip(reparsed.doc).textContent).toBe('%note');
		expect(reparsed.doc.textContent).toContain('more prose after');
	});
});

describe('a comment line inside a formatting group', () => {
	const regenerated = (body: string) => {
		const parsed = parseLatexFile(wrap(body));
		return serializeLatexFile(parsed, withoutOrigins(parsed.doc));
	};

	it('stays inside the group, the words after it kept', () => {
		const out = regenerated('Some \\textbf{%\n% a note\nbold words%\n} after.');
		expect(out).toContain('\\textbf{%\n% a note\nbold words}');
		expect(regenerated(out.slice(out.indexOf('Some'), out.indexOf('\n\\end{document}')))).toBe(out);
	});

	it('keeps one group around the words either side of it', () => {
		expect(regenerated('\\textcolor{blue}{First.\n% idea\nSecond.}')).toMatch(/\\textcolor\{blue\}\{First\. ?\n% idea\nSecond\.\}/);
	});

	it('keeps a command with a comment after it inside the group', () => {
		const body = '\\textcolor{gray}{%\n  \\ding{51}%\n  \\rotatebox{1}{x}%\n}';
		const parsed = parseLatexFile(wrap(body));
		expect(serializeLatexFile(parsed, parsed.doc)).toBe(wrap(body));
		expect(regenerated(body)).toContain('\\textcolor{gray}{\\ding{51}%\n');
	});
});
