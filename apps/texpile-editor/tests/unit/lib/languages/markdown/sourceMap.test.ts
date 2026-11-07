// the Markdown source map, both ways: every text run of a parse is its bytes, and a document
// written out afresh maps its runs to the text it made
import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import type { Node as PMNode } from 'prosemirror-model';
import { parseMarkdownFile, serializeMarkdownFile, serializeMarkdownFileDetailed } from '$lib/languages/markdown/visual/roundtrip';
import { pmToSource, sourceToPm } from '$lib/editor/visual/sourceSpans';
import { withoutOrigins } from '$lib/editor/visual/parseOrigins';
import { auditMap, coverage } from '../../editor/visual/sourceMapAudit';
import { FORMATS } from '../../workspace/visualEditsFuzz';

const files = FORMATS[1].files;

function posOf(doc: PMNode, needle: string): number {
	let found = -1;
	doc.descendants((n, pos) => {
		if (found >= 0) return false;
		if (n.isText) {
			const i = n.text!.indexOf(needle);
			if (i >= 0) found = pos + i;
		}
		return found < 0;
	});
	if (found < 0) throw new Error(`no text ${JSON.stringify(needle)}`);
	return found;
}

describe('the Markdown parser source map', () => {
	it('is exact on every fixture and covers its prose', () => {
		expect(files.length).toBeGreaterThan(0);
		const failures: string[] = [];
		const audits = files.map((f) => {
			const text = readFileSync(f, 'utf8');
			const { doc, map } = parseMarkdownFile(text);
			const a = auditMap(doc, text, map.leaves);
			for (const p of a.problems.slice(0, 5)) failures.push(`${f}: ${p}`);
			return a;
		});
		expect(failures).toEqual([]);
		const { prose, nodes } = coverage(audits);
		console.log(
			`markdown parser map coverage over ${files.length} files: prose ${(prose * 100).toFixed(1)}%, leaf nodes ${(nodes * 100).toFixed(1)}%`
		);
		expect(prose).toBeGreaterThan(0.95);
		expect(nodes).toBeGreaterThan(0.9);
	});

	// a run of delimiters that opens nothing is text, each star its own byte
	it('gives each star of a run that opens nothing its own byte, so its paragraph writes back as it was', () => {
		const src = 'Words in th**e panel and snake__case here.\n\nNext.\n';
		const parsed = parseMarkdownFile(src);
		expect(parsed.origins?.defects).toEqual([]);
		expect(serializeMarkdownFile(parsed, parsed.doc)).toBe(src);
	});

	it('maps prose inside markers, an escape and a formula', () => {
		const src = '# A title\n\n> Quoted *words* here,\n> and a \\* star $x^2$ and `code`.\n\n- item one\n- item two\n';
		const { doc, map } = parseMarkdownFile(src);
		const spans = map.leaves;
		expect(sourceToPm(spans, src.indexOf('title'))).toBe(posOf(doc, 'title'));
		expect(sourceToPm(spans, src.indexOf('words'))).toBe(posOf(doc, 'words'));
		expect(pmToSource(spans, posOf(doc, 'here') + 2)).toBe(src.indexOf('here') + 2);
		expect(sourceToPm(spans, src.indexOf('item two'))).toBe(posOf(doc, 'item two'));
		// the star is the byte after its backslash
		expect(pmToSource(spans, posOf(doc, '* star'), 1)).toBe(src.indexOf('\\*') + 1);
		expect(sourceToPm(spans, src.indexOf('code'))).toBe(posOf(doc, 'code'));
		expect(pmToSource(spans, posOf(doc, 'x^2') - 1, 1)).toBe(src.indexOf('$x^2$'));
	});

	it('maps table cells and a fenced block line by line', () => {
		const src = '| a | b |\n| - | - |\n| one | two |\n\n```js\nlet x = 1;\nlet y = 2;\n```\n';
		const { doc, map } = parseMarkdownFile(src);
		expect(sourceToPm(map.leaves, src.indexOf('two'))).toBe(posOf(doc, 'two'));
		expect(sourceToPm(map.leaves, src.indexOf('let y'))).toBe(posOf(doc, 'let y'));
	});
});

describe('the Markdown serializer source map', () => {
	it('carries an untouched document’s runs to where they were', () => {
		const failures: string[] = [];
		for (const f of files) {
			const text = readFileSync(f, 'utf8');
			const parsed = parseMarkdownFile(text);
			const out = serializeMarkdownFileDetailed(parsed, parsed.doc);
			if (out.text !== text) continue; // the byte round trip has its own oracle
			if (JSON.stringify(out.map.leaves) !== JSON.stringify(parsed.map.leaves)) failures.push(`${f}: leaves differ`);
		}
		expect(failures).toEqual([]);
	});

	it('is exact on a regenerated document and covers its prose', () => {
		const failures: string[] = [];
		const audits = files.map((f) => {
			const parsed = parseMarkdownFile(readFileSync(f, 'utf8'));
			const doc = withoutOrigins(parsed.doc);
			const out = serializeMarkdownFileDetailed(parsed, doc);
			const a = auditMap(doc, out.text, out.map.leaves);
			for (const p of a.problems.slice(0, 5)) failures.push(`${f}: ${p}`);
			return a;
		});
		expect(failures).toEqual([]);
		const { prose, nodes } = coverage(audits);
		console.log(
			`markdown serializer map coverage over ${files.length} regenerated files: prose ${(prose * 100).toFixed(1)}%, leaf nodes ${(nodes * 100).toFixed(1)}%`
		);
		expect(prose).toBeGreaterThan(0.9);
		expect(nodes).toBeGreaterThan(0.8);
	});

	it('maps a regenerated paragraph both ways, escapes included', () => {
		const parsed = parseMarkdownFile('Hello *world*, 100% of $x$ and a\\*b.\n');
		const doc = withoutOrigins(parsed.doc);
		const { text, map } = serializeMarkdownFileDetailed(parsed, doc);
		const world = posOf(doc, 'world');
		expect(pmToSource(map.leaves, world + 1)).toBe(text.indexOf('world') + 1);
		expect(sourceToPm(map.leaves, text.indexOf('world') + 3)).toBe(world + 3);
		const star = posOf(doc, '*b');
		expect(pmToSource(map.leaves, star, 1)).toBe(text.indexOf('\\*b'));
		expect(pmToSource(map.leaves, star + 1, -1)).toBe(text.indexOf('\\*b') + 2);
	});
});
