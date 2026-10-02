// a paragraph written afresh keeps the wrap the file gave the paragraph it replaces, at the top
// level and inside a container, in every dialect, and its runs still say where every word is
import { describe, it, expect } from 'vitest';
import { Fragment, type Node } from 'prosemirror-model';
import { parseLatexFile, serializeLatexFileDetailed } from '$lib/workspace/latexRoundtrip';
import { parseMarkdownFile, serializeMarkdownFileDetailed } from '$lib/languages/markdown/visual/roundtrip';
import { parseTypstFile, serializeTypstFileDetailed } from '$lib/languages/typst/visual/roundtrip';
import { pmToSource, type SourceMap } from '$lib/editor/visual/sourceSpans';
import { forgetBlock } from '$lib/editor/visual/parseOrigins';

function retype(doc: Node, path: number[], fn: (t: string) => string): Node {
	function go(node: Node, depth: number): Node {
		const kids: Node[] = [];
		if (depth === path.length) {
			let done = false;
			node.forEach((c) => {
				if (!done && c.isText) {
					kids.push(c.type.schema.text(fn(c.text!), c.marks));
					done = true;
				} else kids.push(c);
			});
		} else node.forEach((c, _o, i) => kids.push(i === path[depth] ? go(c, depth + 1) : c));
		return node.type.create(node.attrs, Fragment.fromArray(kids), node.marks);
	}
	return go(doc, 0);
}

function posOf(doc: Node, needle: string): number {
	let found = -1;
	doc.descendants((n, pos) => {
		if (found >= 0 || !n.isText) return found < 0;
		const at = n.text!.indexOf(needle);
		if (at >= 0) found = pos + at;
		return false;
	});
	if (found < 0) throw new Error(`no ${needle}`);
	return found;
}

function wordsMap(doc: Node, text: string, map: SourceMap, words: string[]): void {
	for (const word of words) {
		const off = pmToSource(map.leaves, posOf(doc, word) + 1);
		expect(off, word).not.toBeNull();
		expect(text.slice(off! - 1, off! - 1 + word.length), word).toBe(word);
	}
}

const WRAPPED = 'The quick brown fox jumps over\nthe lazy dog and keeps on\nrunning through the field.';

describe('a paragraph written afresh keeps the wrap of the one it replaces', () => {
	it('latex: at the top level, written whole', () => {
		const src = `\\documentclass{article}\n\\begin{document}\n${WRAPPED}\n\nNext one.\n\\end{document}\n`;
		const parsed = parseLatexFile(src);
		// written whole, not spliced: the way the save check falls back
		const edited = retype(parsed.doc, [0], (t) => t.replace('quick', 'QUICK and nimble'));
		const afresh = new Set([forgetBlock(edited.child(0))]);
		const kids: Node[] = [];
		edited.forEach((c, _o, i) => kids.push(i === 0 ? [...afresh][0] : c));
		const doc = edited.copy(Fragment.fromArray(kids));
		const { text, map } = serializeLatexFileDetailed(parsed, doc, afresh);
		const body = text.slice(text.indexOf('The'), text.indexOf('\n\nNext'));
		expect(body.split('\n').length).toBeGreaterThanOrEqual(3);
		expect(Math.max(...body.split('\n').map((l) => l.length))).toBeLessThanOrEqual(30);
		expect(body.replace(/\n/g, ' ')).toBe('The QUICK and nimble brown fox jumps over the lazy dog and keeps on running through the field.');
		wordsMap(doc, text, map, ['QUICK', 'lazy', 'field', 'Next']);
	});

	it('markdown: inside a list item, under the marker', () => {
		const md = `- first\n- ${WRAPPED.replace(/\n/g, '\n  ')}\n- third\n`;
		const parsed = parseMarkdownFile(md);
		// an ampersand is no plain seam, so the paragraph is written afresh rather than spliced
		const doc = retype(parsed.doc, [1, 0], (t) => t.replace('quick', 'QUICK & nimble'));
		const { text, map } = serializeMarkdownFileDetailed(parsed, doc);
		expect(text).toContain(
			'- first\n- The QUICK & nimble brown fox\n  jumps over the lazy dog and\n  keeps on running through the\n  field.\n- third\n'
		);
		wordsMap(doc, text, map, ['first', 'QUICK', 'lazy', 'field', 'third']);
		expect(parseMarkdownFile(text).doc.textContent).toBe(doc.textContent);
	});

	it('typst: at the top level', () => {
		const src = `= Title\n\n${WRAPPED}\n\nNext one.\n`;
		const parsed = parseTypstFile(src);
		const doc = retype(parsed.doc, [1], (t) => t.replace('quick', 'QUICK and nimble'));
		const afresh = new Set<Node>();
		const kids: Node[] = [];
		doc.forEach((c, _o, i) => {
			if (i !== 1) return kids.push(c);
			const fresh = forgetBlock(c);
			afresh.add(fresh);
			kids.push(fresh);
		});
		const whole = doc.copy(Fragment.fromArray(kids));
		const { text, map } = serializeTypstFileDetailed(parsed, whole, afresh);
		expect(text).toContain(
			'The QUICK and nimble brown fox\njumps over the lazy dog and\nkeeps on running through the\nfield.\n\nNext one.'
		);
		wordsMap(whole, text, map, ['QUICK', 'lazy', 'field', 'Next']);
	});

	it('does not wrap a paragraph the file had on one line, nor break before markup', () => {
		const src = '\\documentclass{article}\n\\begin{document}\nOne line here that is long enough.\n\\end{document}\n';
		const parsed = parseLatexFile(src);
		const doc = retype(parsed.doc, [0], (t) => t + ' And more words typed at the end of it.');
		const { text } = serializeLatexFileDetailed(parsed, doc);
		expect(text).toContain('One line here that is long enough. And more words typed at the end of it.\n');
	});
});
